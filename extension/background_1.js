importScripts('i18n_bootstrap.js','i18n_data/en.js','i18n_data/ru.js','i18n_data/es.js','i18n_data/de.js','i18n_data/fr.js','i18n_data/pt_BR.js','i18n_data/zh_CN.js','i18n_data/zh_TW.js','i18n_data/ja.js','i18n_data/ko.js','i18n_data/ar.js','i18n_data/hi.js','i18n_data/id.js','i18n_data/tr.js','i18n_data/it.js','i18n_data/pl.js','i18n_data/uk.js','i18n_data/vi.js','i18n.js','i18n_patch_v056.js','sites.js');
const OFFSCREEN_DOCUMENT = 'offscreen.html';
const LOG_KEY = 'debugLogs';
const WATCH_REGISTRY_KEY = 'watchRegistry';
const SITE_SETTINGS_KEY = 'siteSettings';
const GLOBAL_PROFILE_KEY = 'globalProfile';
const APPEARANCE_KEY = 'appearanceSettings';
const MAX_LOGS = 500;

const DEFAULT_SETTINGS = {
  soundEnabled: true,
  soundVolume: 1,
  repeatSound: false,
  focusTab: false,
  stopOnTabFocus: false,
  stopOnAutoFocus: false,
  showNotification: true,
  flashTitle: true,
  inPagePanel: true
};

const autoFocusMarks = new Map();
function markDoneBellAutoFocus(tabId){autoFocusMarks.set(tabId,Date.now());setTimeout(()=>{if(Date.now()-(autoFocusMarks.get(tabId)||0)>=1800)autoFocusMarks.delete(tabId);},1900);}
function isRecentDoneBellAutoFocus(tabId){const ts=autoFocusMarks.get(tabId)||0;return Date.now()-ts<1800;}

const I18N = globalThis.DoneBellI18n;
const SITE_API = globalThis.DoneBellSites;
const BADGES = {
  off: { text: '', color: '#5f6368', titleKey: 'badgeOff' },
  armed: { text: 'ON', color: '#16883f', titleKey: 'badgeArmed' },
  generating: { text: '…', color: '#b7791f', titleKey: 'badgeGenerating' },
  done: { text: '!', color: '#c5221f', titleKey: 'badgeDone' },
  error: { text: 'X', color: '#c5221f', titleKey: 'badgeError' }
};

let logWriteChain = Promise.resolve();
let registryWriteChain = Promise.resolve();
let activeAudioOwnerTabId = null;
let audioPlaying = false;
let activeAudioReason = null;

const transientStore = chrome.storage.session || chrome.storage.local;

function safeDetails(details) {
  if (details == null) return null;
  try { return JSON.parse(JSON.stringify(details)); } catch { return String(details); }
}

function appendLog(source, level, message, details = null) {
  const entry = { ts: new Date().toISOString(), source, level, message, details: safeDetails(details) };
  console[level === 'error' ? 'error' : 'log']('[DoneBell]', entry);
  logWriteChain = logWriteChain.then(async () => {
    const data = await chrome.storage.local.get(LOG_KEY);
    const logs = Array.isArray(data[LOG_KEY]) ? data[LOG_KEY] : [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    await chrome.storage.local.set({ [LOG_KEY]: logs });
  }).catch((error) => console.error('[DoneBell] log persist failed', error));
  return logWriteChain;
}

async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getSiteSettingsMap() {
  const data = await chrome.storage.local.get(SITE_SETTINGS_KEY);
  return data[SITE_SETTINGS_KEY] && typeof data[SITE_SETTINGS_KEY] === 'object' ? data[SITE_SETTINGS_KEY] : {};
}

async function getEffectiveSettings(siteId = null) {
  const globalSettings = await getSettings();
  if (!siteId) return globalSettings;
  const map = await getSiteSettingsMap();
  return SITE_API.effectiveSettings(globalSettings, map[siteId]);
}

async function getUiLanguage() {
  const data = await chrome.storage.local.get('uiLanguage');
  return I18N.resolveLanguage(data.uiLanguage || 'auto', chrome.i18n.getUILanguage?.() || 'en');
}

async function tr(key, vars = null) {
  return I18N.t(await getUiLanguage(), key, vars);
}

async function setBadge(tabId, state) {
  if (!Number.isInteger(tabId)) return;
  const badge = BADGES[state] || BADGES.off;
  try {
    await chrome.action.setBadgeText({ tabId, text: badge.text });
    if (badge.text) await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
    await chrome.action.setTitle({ tabId, title: await tr(badge.titleKey) });
  } catch (error) {
    await appendLog('background', 'info', 'Could not set badge (tab may be gone)', { tabId, state, error: String(error) });
  }
}

async function readRegistry() {
  const data = await transientStore.get(WATCH_REGISTRY_KEY);
  return data[WATCH_REGISTRY_KEY] && typeof data[WATCH_REGISTRY_KEY] === 'object'
    ? data[WATCH_REGISTRY_KEY] : {};
}

function updateRegistry(mutator) {
  registryWriteChain = registryWriteChain.then(async () => {
    const registry = await readRegistry();
    await mutator(registry);
    await transientStore.set({ [WATCH_REGISTRY_KEY]: registry });
  }).catch((error) => appendLog('background', 'error', 'Watch registry update failed', { error: String(error) }));
  return registryWriteChain;
}

async function registerWatch(tabId, info) {
  await updateRegistry((registry) => {
    registry[String(tabId)] = { ...info, registeredAt: new Date().toISOString() };
  });
}

async function unregisterWatch(tabId) {
  await updateRegistry((registry) => { delete registry[String(tabId)]; });
}

async function isWatched(tabId) {
  const registry = await readRegistry();
  return Boolean(registry[String(tabId)]);
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] });
    if (contexts.length) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play a local completion alert selected by the user when a watched browser task finishes.'
    });
    await appendLog('background', 'info', 'Offscreen audio document created');
  } catch (error) {
    if (!String(error).toLowerCase().includes('single offscreen')) {
      await appendLog('background', 'error', 'Could not create offscreen document', { error: String(error) });
      throw error;
    }
  }
}

async function playSound(reason = 'completion', ownerTabId = null, alertSettings = null) {
  const stored = await chrome.storage.local.get(['customSoundDataUrl', 'customSoundName', 'soundVolume', 'repeatSound']);
  const effective = alertSettings || stored;
  const rawVolume = effective.soundVolume ?? stored.soundVolume;
  const volume = Number.isFinite(Number(rawVolume)) ? Math.max(0, Math.min(1, Number(rawVolume))) : 1;
  const repeat = Boolean(effective.repeatSound ?? stored.repeatSound);
  const sound = stored.customSoundDataUrl
    ? { mode: 'custom', dataUrl: stored.customSoundDataUrl, name: stored.customSoundName || 'custom', volume, repeat }
    : { mode: 'builtin', name: 'built-in bell', volume, repeat };

  await ensureOffscreenDocument();
  await appendLog('background', 'info', 'Requesting sound playback', { reason, ownerTabId, mode: sound.mode, name: sound.name, volume, repeat: sound.repeat });
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'play-sound', reason, ownerTabId, sound });
  if (response?.ok === false) throw new Error(response.error || 'Audio playback failed');
}

async function stopSound(reason = 'manual-stop') {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-sound', reason });
  if (response?.ok === false) throw new Error(response.error || 'Could not stop sound');
  return Boolean(response?.stopped);
}

async function setLiveVolume(volume) {
  if (!audioPlaying) return { ok: true, playing: false };
  const safeVolume = Number.isFinite(Number(volume)) ? Math.max(0, Math.min(1, Number(volume))) : 1;
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'set-volume', volume: safeVolume });
  if (response?.ok === false) throw new Error(response.error || 'Could not update live volume');
  return response || { ok: true, volume: safeVolume };
}

async function sendToTab(tabId, message, diagnosticLabel = null) {
  if (!Number.isInteger(tabId)) return false;
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (error) {
    if (diagnosticLabel) await appendLog('background', 'info', diagnosticLabel, { tabId, error: String(error) });
    return false;
  }
}

async function focusTab(tabId, windowId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    if (Number.isInteger(windowId)) await chrome.windows.update(windowId, { focused: true });
    await appendLog('background', 'info', 'Focused completed tab', { tabId, windowId });
  } catch (error) {
    await appendLog('background', 'error', 'Could not focus completed tab', { tabId, windowId, error: String(error) });
  }
}

function cleanTitle(title, fallback = 'Task') {
  const value = String(title || fallback);
  const cleaned = value.startsWith('🔔 ') && value.includes(' — ') ? value.slice(value.indexOf(' — ') + 3) : value;
  return cleaned.trim().slice(0, 180) || fallback;
}

async function createDoneNotification(tab, site, title) {
  const notificationId = `donebell:${tab.id}:${Date.now()}`;
  const siteName = site?.name || 'Browser task';
  const clean = cleanTitle(title, siteName);
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: await tr('taskFinishedTitle', { site: siteName }),
    message: await tr('taskFinishedMessage', { title: clean }),
    priority: 2,
    requireInteraction: true,
    silent: true,
    buttons: [{ title: `■ ${await tr('stopSound')}` }]
  });
  await appendLog('background', 'info', 'System notification created', { tabId: tab.id, site: siteName, notificationId });
  return notificationId;
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'ping-donebell' });
    if (ping?.ok && ping.version === chrome.runtime.getManifest().version) return true;
  } catch {}
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['i18n_bootstrap.js','i18n_data/en.js','i18n_data/ru.js','i18n_data/es.js','i18n_data/de.js','i18n_data/fr.js','i18n_data/pt_BR.js','i18n_data/zh_CN.js','i18n_data/zh_TW.js','i18n_data/ja.js','i18n_data/ko.js','i18n_data/ar.js','i18n_data/hi.js','i18n_data/id.js','i18n_data/tr.js','i18n_data/it.js','i18n_data/pl.js','i18n_data/uk.js','i18n_data/vi.js','i18n.js','i18n_patch_v056.js','sites.js','content.js'] });
    await appendLog('background', 'info', 'Content script injected via activeTab', { tabId });
    return true;
  } catch (error) {
    await appendLog('background', 'error', 'Could not inject content script', { tabId, error: String(error) });
    await setBadge(tabId, 'error');
    return false;
  }
}

function autoScriptId(siteId) { return `donebell-auto-${String(siteId).replace(/[^a-z0-9_-]/gi, '-')}`; }
async function autoWatchPermissionGranted(site) { if (!site) return false; try { return await chrome.permissions.contains({ origins: site.patterns }); } catch { return false; } }
async function unregisterAutoWatchScript(siteId) {
  const id=autoScriptId(siteId);
  try { const scripts=await chrome.scripting.getRegisteredContentScripts({ids:[id]}); if(scripts.length) await chrome.scripting.unregisterContentScripts({ids:[id]}); }
  catch(error){ await appendLog('background','info','Auto-watch script unregister skipped',{siteId,error:String(error)}); }
}
async function injectAutoWatchIntoOpenTabs(site) {
  if(!site)return;
  try { const tabs=await chrome.tabs.query({url:site.patterns}); for(const tab of tabs){ if(!Number.isInteger(tab.id))continue; const ready=await ensureContentScript(tab.id); if(ready) await sendToTab(tab.id,{type:'auto-watch-arm',siteId:site.id},'Could not arm auto-watch in an existing tab'); } }
  catch(error){ await appendLog('background','info','Could not arm existing auto-watch tabs',{siteId:site.id,error:String(error)}); }
}
async function syncAutoWatchSite(siteId,{injectOpenTabs=false}={}) {
  const site=SITE_API.SITE_CATALOG.find(x=>x.id===siteId); if(!site)return{ok:false,error:'Unknown site'};
  const map=await getSiteSettingsMap(),cfg=SITE_API.normalizeSiteSettings(map[siteId]),granted=await autoWatchPermissionGranted(site);
  await unregisterAutoWatchScript(siteId);
  if(!cfg.autoWatch||!granted){
    if(injectOpenTabs){try{const tabs=await chrome.tabs.query({url:site.patterns});for(const tab of tabs)if(Number.isInteger(tab.id))await sendToTab(tab.id,{type:'disable-auto-watch',siteId},null);}catch{}}
    await appendLog('background','info','Auto-watch disabled or permission absent',{siteId,autoWatch:cfg.autoWatch,granted}); return{ok:true,registered:false,granted};
  }
  const id=autoScriptId(siteId);
  try { await chrome.scripting.registerContentScripts([{id,matches:site.patterns,js:['i18n_bootstrap.js','i18n_data/en.js','i18n_data/ru.js','i18n_data/es.js','i18n_data/de.js','i18n_data/fr.js','i18n_data/pt_BR.js','i18n_data/zh_CN.js','i18n_data/zh_TW.js','i18n_data/ja.js','i18n_data/ko.js','i18n_data/ar.js','i18n_data/hi.js','i18n_data/id.js','i18n_data/tr.js','i18n_data/it.js','i18n_data/pl.js','i18n_data/uk.js','i18n_data/vi.js','i18n.js','i18n_patch_v056.js','sites.js','content.js'],runAt:'document_idle',persistAcrossSessions:true}]); await appendLog('background','info','Auto-watch content script registered',{siteId,patterns:site.patterns}); if(injectOpenTabs)await injectAutoWatchIntoOpenTabs(site); return{ok:true,registered:true,granted}; }
  catch(error){await appendLog('background','error','Auto-watch registration failed',{siteId,error:String(error)});return{ok:false,error:String(error),registered:false,granted};}
}
async function syncAllAutoWatch(){for(const site of SITE_API.SITE_CATALOG)await syncAutoWatchSite(site.id);}

async function resetAllSettings(){
  try{await stopSound('factory-reset');}catch{}
  for(const site of SITE_API.SITE_CATALOG){
    try{await unregisterAutoWatchScript(site.id);}catch{}
    try{await chrome.permissions.remove({origins:site.patterns});}catch{}
  }
  try{const tabs=await chrome.tabs.query({});for(const tab of tabs){if(Number.isInteger(tab.id))await sendToTab(tab.id,{type:'disable-watch',reason:'factory-reset'},null);}}catch{}
  await chrome.storage.local.clear();
  await chrome.storage.local.set({...DEFAULT_SETTINGS,uiLanguage:'auto',[GLOBAL_PROFILE_KEY]:'normal',[SITE_SETTINGS_KEY]:{},[APPEARANCE_KEY]:{fontFamily:'system',fontSize:14,backgroundColor:'#0d0d0f',accentColor:'#ffd42a',badgeBuiltinColor:'#38b35d',badgeDedicatedColor:'#ffbe24',badgeGenericColor:'#5591eb',badgeStrength:22},[LOG_KEY]:[]});
  await transientStore.set({[WATCH_REGISTRY_KEY]:{}});
  audioPlaying=false;activeAudioOwnerTabId=null;activeAudioReason=null;
  await appendLog('background','info','DoneBell settings reset to defaults',{version:chrome.runtime.getManifest().version});
  return{ok:true};
}

async function acknowledgeTab(tabId) {
  const ok = await sendToTab(tabId, { type: 'dismiss-completion' });
  if (!ok) await setBadge(tabId, 'off');
}
