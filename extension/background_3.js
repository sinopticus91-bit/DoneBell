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
