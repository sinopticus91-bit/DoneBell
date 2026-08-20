importScripts('i18n.js', 'sites.js');
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
  showNotification: true,
  flashTitle: true,
  inPagePanel: true
};

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
    await chrome.scripting.executeScript({ target: { tabId }, files: ['i18n.js', 'sites.js', 'content.js'] });
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
  try { await chrome.scripting.registerContentScripts([{id,matches:site.patterns,js:['i18n.js','sites.js','content.js'],runAt:'document_idle',persistAcrossSessions:true}]); await appendLog('background','info','Auto-watch content script registered',{siteId,patterns:site.patterns}); if(injectOpenTabs)await injectAutoWatchIntoOpenTabs(site); return{ok:true,registered:true,granted}; }
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
    setBadge(tab.id, message.state).catch(() => {});
    return;
  }

  if (message?.type === 'completion-acknowledged') {
    (async () => {
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'get-watch-status' });
        await setBadge(tab.id, status?.watching && status?.mode === 'ai' ? 'armed' : 'off');
      } catch { await setBadge(tab.id, 'off'); }
    })();
    return;
  }

  if (message?.type === 'task-complete') {
    (async () => {
      const settings = await getEffectiveSettings(message.site?.id || null);
      await appendLog('background', 'info', 'Task complete received', {
        tabId: tab.id, mode: message.mode, site: message.site, wasVisible: message.wasVisible, trigger: message.trigger
      });
      await setBadge(tab.id, 'done');

      if (settings.focusTab && !message.wasVisible) await focusTab(tab.id, tab.windowId);

      const becomesActive = Boolean(message.wasVisible || settings.focusTab);
      const soundShouldPlay = Boolean(settings.soundEnabled && !(settings.stopOnTabFocus && becomesActive));
      if (settings.soundEnabled && !soundShouldPlay) {
        await appendLog('background', 'info', 'Completion sound suppressed because finished tab is active', { tabId: tab.id, stopOnTabFocus: true, wasVisible: Boolean(message.wasVisible), focusTab: Boolean(settings.focusTab) });
      }

      await sendToTab(tab.id, {
        type: 'show-completion-ui', settings, soundPlaying: soundShouldPlay
      }, 'Could not show in-page completion UI');

      const actions = [];
      if (soundShouldPlay) actions.push(playSound('completion', tab.id, settings));
      if (settings.showNotification) actions.push(createDoneNotification(tab, message.site, message.title));
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

async function maybeStopCompletionSoundForFocusedTab(tabId, reason = 'finished-tab-activated') {
  if (!audioPlaying || activeAudioReason !== 'completion' || activeAudioOwnerTabId !== tabId) return false;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.active || !Number.isInteger(tab.windowId)) return false;
    const win = await chrome.windows.get(tab.windowId);
    if (!win?.focused) return false;
    const site = SITE_API.siteForUrl(tab.url || '');
    const settings = await getEffectiveSettings(site?.id || null);
    if (!settings.stopOnTabFocus) return false;
    const stopped = await stopSound(reason);
    await acknowledgeTab(tabId);
    await clearDoneNotificationsForTab(tabId);
    await appendLog('background', 'info', 'Stopped completion sound because finished tab became active', { tabId, site: site?.name || null, reason, stopped });
    return stopped;
  } catch (error) {
    await appendLog('background', 'info', 'Could not evaluate stop-on-active-tab', { tabId, reason, error: String(error) });
    return false;
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  maybeStopCompletionSoundForFocusedTab(tabId, 'finished-tab-activated').catch(() => {});
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE || !audioPlaying || activeAudioReason !== 'completion') return;
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs[0]?.id === activeAudioOwnerTabId) await maybeStopCompletionSoundForFocusedTab(tabs[0].id, 'finished-window-focused');
  } catch {}
});

chrome.permissions.onAdded.addListener(async (permissions) => {
  const addedOrigins = permissions?.origins || [];
  if (!addedOrigins.length) return;
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
