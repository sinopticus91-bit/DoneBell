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

// Gemini background-completion support.
// Gemini may delay DOM updates while its tab is in the background. While a
// Gemini tab is actively watched, DoneBell observes only the lifecycle of the
// dedicated BardFrontendService/StreamGenerate request. Request/response
// bodies, headers, cookies, prompts and answers are never read.
const geminiBusySince = new Map();
const geminiStreamRequests = new Map();
const geminiWatchedTabs = new Set();

function resolveGeminiStreamTab(details) {
  const rawTabId = Number(details?.tabId);
  if (Number.isInteger(rawTabId) && rawTabId >= 0 && geminiWatchedTabs.has(rawTabId)) return rawTabId;
  if (rawTabId === -1) {
    let initiator = '';
    try { initiator = new URL(String(details?.initiator || '')).origin; } catch {}
    if (initiator === 'https://gemini.google.com' && geminiWatchedTabs.size === 1) return [...geminiWatchedTabs][0];
  }
  return null;
}

function isGeminiStreamGenerate(details) {
  try {
    const url = new URL(String(details?.url || ''));
    return url.origin === 'https://gemini.google.com' &&
      url.pathname.endsWith('/assistant.lamda.BardFrontendService/StreamGenerate');
  } catch {
    return false;
  }
}

function installGeminiStreamObserver() {
  if (!chrome.webRequest?.onBeforeRequest) return;
  const filter = {
    urls: ['https://gemini.google.com/*'],
    types: ['xmlhttprequest']
  };

  chrome.webRequest.onBeforeRequest.addListener((details) => {
    if (!isGeminiStreamGenerate(details)) return;
    const tabId = resolveGeminiStreamTab(details);
    if (tabId == null) return;
    const requestId = String(details.requestId || '');
    geminiStreamRequests.set(requestId, {
      tabId,
      startedAt: Date.now()
    });
    appendLog('background', 'info', 'Gemini generation stream started', { tabId });
  }, filter);

  chrome.webRequest.onCompleted.addListener((details) => {
    if (!isGeminiStreamGenerate(details)) return;
    const requestId = String(details.requestId || '');
    const tracked = geminiStreamRequests.get(requestId);
    if (tracked) geminiStreamRequests.delete(requestId);

    const tabId = tracked?.tabId ?? resolveGeminiStreamTab(details);
    if (tabId == null) return;

    const completedAt = Date.now();
    const startedAt = tracked?.startedAt || completedAt;
    const durationMs = Math.max(0, completedAt - startedAt);
    const busySince = geminiBusySince.get(tabId) || 0;
    const correlated = Boolean(busySince && (tracked ? startedAt >= busySince - 5000 : true));
    const statusCode = Number(details.statusCode) || 0;

    if (statusCode >= 200 && statusCode < 300 && correlated) {
      geminiBusySince.delete(tabId);
      appendLog('background', 'info', 'Gemini generation stream completed', {
        tabId,
        durationMs
      });
      sendToTab(tabId, {
        type: 'gemini-streamgenerate-complete',
        durationMs
      }).catch(() => {});
    }
  }, filter);

  chrome.webRequest.onErrorOccurred.addListener((details) => {
    const requestId = String(details.requestId || '');
    const tracked = geminiStreamRequests.get(requestId);
    if (!tracked) return;
    geminiStreamRequests.delete(requestId);
    appendLog('background', 'info', 'Gemini generation stream ended with network error', {
      tabId: tracked.tabId,
      durationMs: Math.max(0, Date.now() - tracked.startedAt),
      error: String(details.error || '').slice(0, 120)
    });
  }, filter);
}

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

installGeminiStreamObserver();

async function registerWatch(tabId, info) {
  await updateRegistry((registry) => {
    registry[String(tabId)] = { ...info, registeredAt: new Date().toISOString() };
  });
  if (info?.site?.id === 'gemini') { geminiBusySince.delete(tabId); geminiWatchedTabs.add(tabId); }
}

async function unregisterWatch(tabId) {
  await updateRegistry((registry) => { delete registry[String(tabId)]; });
  geminiBusySince.delete(tabId);
  geminiWatchedTabs.delete(tabId);
  for (const [requestId, item] of geminiStreamRequests.entries()) {
    if (item?.tabId === tabId) geminiStreamRequests.delete(requestId);
  }
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
  const expectedVersion = chrome.runtime.getManifest().version;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'ping-donebell' });
    if (ping?.ok && ping.version === expectedVersion) return true;
  } catch {}
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['i18n_bootstrap.js','i18n_data/en.js','i18n_data/ru.js','i18n_data/es.js','i18n_data/de.js','i18n_data/fr.js','i18n_data/pt_BR.js','i18n_data/zh_CN.js','i18n_data/zh_TW.js','i18n_data/ja.js','i18n_data/ko.js','i18n_data/ar.js','i18n_data/hi.js','i18n_data/id.js','i18n_data/tr.js','i18n_data/it.js','i18n_data/pl.js','i18n_data/uk.js','i18n_data/vi.js','i18n.js','i18n_patch_v056.js','sites.js','content.js'] });
    await new Promise(resolve => setTimeout(resolve, 80));
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'ping-donebell' });
    if (!ping?.ok || ping.version !== expectedVersion) throw new Error(`Content script verification failed (expected ${expectedVersion}, got ${ping?.version || 'no response'})`);
    await appendLog('background', 'info', 'Content script injected and verified via activeTab', { tabId, version: ping.version });
    return true;
  } catch (error) {
    await appendLog('background', 'error', 'Could not inject/verify content script', { tabId, error: String(error) });
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

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing=await chrome.storage.local.get(['uiLanguage',SITE_SETTINGS_KEY,GLOBAL_PROFILE_KEY,APPEARANCE_KEY]);
  const baseWrite={...(await getSettings()),...(existing.uiLanguage?{}:{uiLanguage:'auto'}),...(existing[SITE_SETTINGS_KEY]?{}:{[SITE_SETTINGS_KEY]:{}}),...(existing[APPEARANCE_KEY]?{}:{[APPEARANCE_KEY]:{fontFamily:'system',fontSize:14,backgroundColor:'#0d0d0f',accentColor:'#ffd42a',badgeBuiltinColor:'#38b35d',badgeDedicatedColor:'#ffbe24',badgeGenericColor:'#5591eb',badgeStrength:22}})};
  if(!existing[GLOBAL_PROFILE_KEY])baseWrite[GLOBAL_PROFILE_KEY]=details.reason==='install'?'normal':'custom';
  await chrome.storage.local.set(baseWrite); await transientStore.set({[WATCH_REGISTRY_KEY]:{}}); await syncAllAutoWatch();
  await appendLog('background','info','DoneBell installed/updated',{reason:details.reason,version:chrome.runtime.getManifest().version});
});
chrome.runtime.onStartup.addListener(async()=>{await transientStore.set({[WATCH_REGISTRY_KEY]:{}});await syncAllAutoWatch();});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === 'offscreen') return;

  if (message?.type === 'debug-log') {
    appendLog(message.source || (sender.tab ? 'content' : 'unknown'), message.level || 'info', message.message || '', message.details)
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'ensure-content-script' && Number.isInteger(message.tabId)) {
    ensureContentScript(message.tabId).then((ok) => sendResponse({ ok }));
    return true;
  }


  if (message?.type === 'reset-all-settings') { resetAllSettings().then(sendResponse).catch(error=>sendResponse({ok:false,error:String(error)})); return true; }

  if (message?.type === 'sync-auto-watch-site' && message.siteId) { syncAutoWatchSite(message.siteId,{injectOpenTabs:Boolean(message.injectOpenTabs)}).then(sendResponse).catch(error=>sendResponse({ok:false,error:String(error)})); return true; }
  if (message?.type === 'get-auto-watch-status' && message.siteId) { (async()=>{const site=SITE_API.SITE_CATALOG.find(x=>x.id===message.siteId);if(!site){sendResponse({ok:false,error:'Unknown site'});return;}sendResponse({ok:true,granted:await autoWatchPermissionGranted(site)});})();return true; }

  if (message?.type === 'set-live-volume') {
    (async () => {
      try { sendResponse(await setLiveVolume(message.volume)); }
      catch (error) { sendResponse({ ok: false, error: String(error) }); }
    })();
    return true;
  }

  if (message?.type === 'play-test-sound') {
    (async () => {
      try { await playSound('manual-test', Number.isInteger(message.tabId) ? message.tabId : null); sendResponse({ ok: true }); }
      catch (error) { await appendLog('background', 'error', 'Test sound failed', { error: String(error) }); sendResponse({ ok: false, error: String(error) }); }
    })();
    return true;
  }

  if (message?.type === 'stop-sound') {
    (async () => {
      try {
        // Capture ownership before offscreen reports playback=false and clears it.
        const completionOwner = activeAudioReason === 'completion' && Number.isInteger(activeAudioOwnerTabId) ? activeAudioOwnerTabId : null;
        const stopped = await stopSound(message.reason || 'manual-stop');
        if (stopped && message.acknowledgeCompletion && completionOwner != null) {
          await acknowledgeTab(completionOwner);
          await clearDoneNotificationsForTab(completionOwner);
          await appendLog('background', 'info', 'Completion acknowledged because user explicitly stopped its sound', { tabId: completionOwner, reason: message.reason || 'manual-stop' });
        }
        sendResponse({ ok: true, stopped, acknowledgedTabId: completionOwner });
      }
      catch (error) { await appendLog('background', 'error', 'Stop sound failed', { error: String(error) }); sendResponse({ ok: false, error: String(error) }); }
    })();
    return true;
  }

  if (message?.type === 'audio-playback-state') {
    (async () => {
      audioPlaying = Boolean(message.playing);
      activeAudioOwnerTabId = message.playing && Number.isInteger(message.ownerTabId) ? message.ownerTabId : null;
      activeAudioReason = message.playing ? (message.reason || null) : null;
      await appendLog('background', 'info', 'Audio playback state changed', {
        playing: Boolean(message.playing), ownerTabId: message.ownerTabId ?? null, reason: message.reason || null
      });
      await sendToTab(message.ownerTabId, {
        type: 'sound-playback-state', playing: Boolean(message.playing), reason: message.reason || null
      }, 'Could not update in-page audio state');
    })();
    return;
  }

  if (!sender.tab?.id) return;
  const tab = sender.tab;

  if (message?.type === 'register-watch') {
    registerWatch(tab.id, { mode: message.mode, site: message.site, url: message.url, rule: message.rule, autoStarted: Boolean(message.autoStarted) })
      .then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'unregister-watch') {
    unregisterWatch(tab.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'watch-status') {
    if (message.state === 'generating') {
      const site = SITE_API.siteForUrl(tab.url || '');
      if (site?.id === 'gemini') {
        geminiBusySince.set(tab.id, Date.now());
        appendLog('background', 'info', 'Gemini generation detected', { tabId: tab.id });
      }
    }
    setBadge(tab.id, message.state).catch(() => {});
    return;
  }

  if (message?.type === 'completion-acknowledged') {
    (async () => {
      // Any explicit acknowledgement (including the in-page Close button)
      // also dismisses every DoneBell system notification for this tab.
      await clearDoneNotificationsForTab(tab.id);
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-watch-status' });
        await setBadge(tab.id, status?.watching && status?.mode === 'ai' ? 'armed' : 'off');
      } catch { await setBadge(tab.id, 'off'); }
    })();
    return;
  }

  if (message?.type === 'task-complete') {
    (async () => {
      if (message.site?.id === 'gemini') geminiBusySince.delete(tab.id);
      const settings = await getEffectiveSettings(message.site?.id || null);
      await appendLog('background', 'info', 'Task complete received', {
        tabId: tab.id, mode: message.mode, site: message.site, wasVisible: message.wasVisible, trigger: message.trigger
      });
      await setBadge(tab.id, 'done');

      const autoFocusedNow = Boolean(settings.focusTab && !message.wasVisible);
      if (autoFocusedNow) {
        markDoneBellAutoFocus(tab.id);
        await focusTab(tab.id, tab.windowId);
      }

      // Parent setting = acknowledge when the user is already looking at / manually opens
      // the completed tab. Auto-focus is a separate opt-in so the two behaviors do not
      // silently cancel each other.
      const shouldAcknowledgeImmediately = Boolean(
        settings.stopOnTabFocus && (
          message.wasVisible || (autoFocusedNow && settings.stopOnAutoFocus)
        )
      );
      if (shouldAcknowledgeImmediately) {
        await appendLog('background', 'info', 'Completion acknowledged on active finished tab', {
          tabId: tab.id, wasVisible: Boolean(message.wasVisible), autoFocusedNow, stopOnAutoFocus: Boolean(settings.stopOnAutoFocus)
        });
        await acknowledgeTab(tab.id);
        await clearDoneNotificationsForTab(tab.id);
        try {
          const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-watch-status' });
          await setBadge(tab.id, status?.watching && status?.mode === 'ai' ? 'armed' : 'off');
        } catch { await setBadge(tab.id, 'off'); }
        return;
      }

      const soundShouldPlay = Boolean(settings.soundEnabled);

      await sendToTab(tab.id, {
        type: 'show-completion-ui', settings, soundPlaying: soundShouldPlay, autoFocusedByDoneBell: autoFocusedNow
      }, 'Could not show in-page completion UI');

      const actions = [];
      if (soundShouldPlay) actions.push(playSound('completion', tab.id, settings));
      // If DoneBell itself has just brought the completed tab to the front,
      // the in-page completion control is already visible. Avoid showing a
      // second system popup on top of it.
      if (settings.showNotification && !autoFocusedNow) {
        actions.push(createDoneNotification(tab, message.site, message.title));
      } else if (settings.showNotification && autoFocusedNow) {
        await appendLog('background', 'info', 'System notification suppressed because DoneBell auto-focused the completed tab', { tabId: tab.id });
      }
      const results = await Promise.allSettled(actions);
      for (const result of results) {
        if (result.status === 'rejected') {
          await appendLog('background', 'error', 'Completion action failed', { error: String(result.reason) });
          if (soundShouldPlay) await sendToTab(tab.id, { type: 'sound-playback-state', playing: false, reason: 'audio-error' });
        }
      }
    })().catch((error) => appendLog('background', 'error', 'Completion handler crashed', { error: String(error) }));
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  const match = /^donebell:(\d+):/.exec(notificationId);
  if (!match || buttonIndex !== 0) return;
  const tabId = Number(match[1]);
  try { await stopSound('notification-stop-button'); } catch (error) {
    await appendLog('background', 'error', 'Notification stop failed', { error: String(error) });
  }
  await acknowledgeTab(tabId);
  await chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const match = /^donebell:(\d+):/.exec(notificationId);
  if (!match) return;
  const tabId = Number(match[1]);
  try {
    const tab = await chrome.tabs.get(tabId);
    await focusTab(tabId, tab.windowId);
  } catch {}
  await chrome.notifications.clear(notificationId);
  // Deliberately DO NOT stop audio or acknowledge here. Opening a tab can be accidental.
});

function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

async function cancelWatchForNavigation(tabId, fromUrl, toUrl) {
  await unregisterWatch(tabId);
  await setBadge(tabId, 'off');
  await appendLog('background', 'info', 'Watch cancelled because the tab left the watched origin', { tabId, fromUrl, toUrl });
}

async function restoreWatchAfterSameOriginLoad(tabId, tabUrl) {
  const registry = await readRegistry();
  const info = registry[String(tabId)];
  if (!info || !sameOrigin(info.url, tabUrl)) return;
  const ready = await ensureContentScript(tabId);
  if (!ready) return;
  try {
    const status = await chrome.tabs.sendMessage(tabId, { type: 'get-watch-status' });
    if (status?.watching) return;
    const restored = await chrome.tabs.sendMessage(tabId, { type: 'restore-watch', info });
    if (restored?.ok) await appendLog('background', 'info', 'Watch restored after same-origin reload/navigation', { tabId, url: tabUrl, mode: info.mode });
  } catch (error) {
    await appendLog('background', 'info', 'Could not restore same-origin watch yet', { tabId, url: tabUrl, error: String(error) });
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const registry = await readRegistry();
  const info = registry[String(tabId)];
  if (!info) return;
  const nextUrl = changeInfo.url || tab?.url || info.url;
  if (changeInfo.url && !sameOrigin(info.url, nextUrl)) {
    await cancelWatchForNavigation(tabId, info.url, nextUrl);
    return;
  }
  if (changeInfo.url && sameOrigin(info.url, nextUrl)) {
    await updateRegistry((r) => { if (r[String(tabId)]) r[String(tabId)].url = nextUrl; });
    await appendLog('background', 'info', 'Watch preserved across same-origin navigation', { tabId, fromUrl: info.url, toUrl: nextUrl });
  }
  if (changeInfo.status === 'complete' && sameOrigin(info.url, nextUrl)) {
    await restoreWatchAfterSameOriginLoad(tabId, nextUrl);
  }
});


async function clearDoneNotificationsForTab(tabId) {
  try {
    const all = await chrome.notifications.getAll();
    for (const id of Object.keys(all || {})) if (id.startsWith(`donebell:${tabId}:`)) await chrome.notifications.clear(id);
  } catch {}
}

async function maybeAcknowledgeCompletionForFocusedTab(tabId, reason = 'finished-tab-activated', autoTriggered = false) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.active || !Number.isInteger(tab.windowId)) return false;
    const win = await chrome.windows.get(tab.windowId);
    if (!win?.focused) return false;
    const site = SITE_API.siteForUrl(tab.url || '');
    const settings = await getEffectiveSettings(site?.id || null);
    if (!settings.stopOnTabFocus) return false;
    if (autoTriggered && !settings.stopOnAutoFocus) {
      await appendLog('background', 'info', 'Auto-focus did not acknowledge completion because stopOnAutoFocus is off', { tabId, reason });
      return false;
    }
    let status = null;
    try { status = await chrome.tabs.sendMessage(tabId, { type: 'get-watch-status' }); } catch {}
    const ownsCompletionAudio = Boolean(audioPlaying && activeAudioReason === 'completion' && activeAudioOwnerTabId === tabId);
    if (!ownsCompletionAudio && !status?.completionActive) return false;
    const stopped = ownsCompletionAudio ? await stopSound(reason) : false;
    await acknowledgeTab(tabId);
    await clearDoneNotificationsForTab(tabId);
    await appendLog('background', 'info', 'Acknowledged completion because finished tab became active', { tabId, site: site?.name || null, reason, autoTriggered, stopped });
    return true;
  } catch (error) {
    await appendLog('background', 'info', 'Could not evaluate stop-on-active-tab', { tabId, reason, autoTriggered, error: String(error) });
    return false;
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  maybeAcknowledgeCompletionForFocusedTab(tabId, 'finished-tab-activated', isRecentDoneBellAutoFocus(tabId)).catch(() => {});
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs[0]?.id != null) await maybeAcknowledgeCompletionForFocusedTab(tabs[0].id, 'finished-window-focused', isRecentDoneBellAutoFocus(tabs[0].id));
  } catch {}
});

chrome.permissions.onAdded.addListener(async (permissions) => {
  const addedOrigins = permissions?.origins || [];
  if (!addedOrigins.length) return;
  // permissions.request() can close the extension popup. The user's Auto-Watch
  // intent is persisted before that prompt, so the background worker finishes
  // activation even if the popup context disappears.
  try { await new Promise(resolve => setTimeout(resolve, 80)); } catch {}
  const map = await getSiteSettingsMap();
  for (const site of SITE_API.SITE_CATALOG) {
    if (!site.patterns.some(pattern => addedOrigins.includes(pattern))) continue;
    const cfg = SITE_API.normalizeSiteSettings(map[site.id]);
    if (!cfg.autoWatch) continue;
    const result = await syncAutoWatchSite(site.id, { injectOpenTabs: true });
    await appendLog('background', result?.ok === false ? 'error' : 'info', 'Auto-watch activated after site permission was granted', { siteId: site.id, addedOrigins, result });
  }
});

chrome.permissions.onRemoved.addListener(async (permissions) => {
  const removedOrigins=permissions?.origins||[];if(!removedOrigins.length)return;const map=await getSiteSettingsMap();let changed=false;
  for(const site of SITE_API.SITE_CATALOG){if(!site.patterns.some(p=>removedOrigins.includes(p)))continue;const cfg=SITE_API.normalizeSiteSettings(map[site.id]);if(cfg.autoWatch){cfg.autoWatch=false;map[site.id]=cfg;changed=true;}await unregisterAutoWatchScript(site.id);}
  if(changed)await chrome.storage.local.set({[SITE_SETTINGS_KEY]:map});
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await unregisterWatch(tabId);
  if (activeAudioOwnerTabId === tabId) {
    try { await stopSound('owner-tab-closed'); } catch {}
    activeAudioOwnerTabId = null;
  }
});
