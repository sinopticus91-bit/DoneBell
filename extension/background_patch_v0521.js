// DoneBell v0.5.21 hotfix layer.
// Keep this patch isolated from watcher startup/evaluation so notification-title
// cleanup cannot prevent a watcher from arming or detecting completion.
const doneBellTitleSnapshots0521 = new Map();

function doneBellStableTitle0521(value, fallback = 'Task') {
  const raw = String(value || fallback);
  const withoutDoneBellPrefix = raw.startsWith('🔔 ') && raw.includes(' — ')
    ? raw.slice(raw.indexOf(' — ') + 3)
    : raw;
  return withoutDoneBellPrefix
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || fallback;
}

function doneBellStripUnexpectedTrailingCjk0521(value, language = 'en', siteId = null) {
  const text = String(value || '').trim();
  if (siteId !== 'chatgpt') return text;
  if (!text || /^(?:zh(?:_|-)|ja(?:_|-|$)|ko(?:_|-|$))/i.test(String(language || ''))) return text;

  const match = text.match(/^(.*\S)\s+([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF][\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF\s]*)$/u);
  if (!match) return text;

  const prefix = String(match[1] || '').trimEnd();
  const suffix = String(match[2] || '').trim();
  const cjkCount = (suffix.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/gu) || []).length;
  if (prefix.length < 12 || cjkCount < 5) return text;
  return prefix;
}

// Capture a stable title when a watch is armed and refresh it when each AI
// generation actually enters the busy state. This avoids trusting a title that
// a site may mutate by completion time.
chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return;
  if (message?.type === 'register-watch' || (message?.type === 'watch-status' && message.state === 'generating')) {
    doneBellTitleSnapshots0521.set(tabId, doneBellStableTitle0521(sender.tab?.title, message.site?.name || 'Task'));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  doneBellTitleSnapshots0521.delete(tabId);
});

// Override only the notification creator from background.js. Existing detector,
// sound, focus, navigation, permissions and i18n behavior remains untouched.
async function createDoneNotification(tab, site, title) {
  const notificationId = `donebell:${tab.id}:${Date.now()}`;
  const siteName = site?.name || 'Browser task';
  const language = await getUiLanguage();
  const captured = doneBellTitleSnapshots0521.get(tab.id) || title || siteName;
  let clean = doneBellStableTitle0521(captured, siteName);

  try {
    clean = doneBellStripUnexpectedTrailingCjk0521(clean, language, site?.id || null);
  } catch (error) {
    // Fail open: title cleanup must never block the completion notification.
    clean = doneBellStableTitle0521(captured, siteName);
    await appendLog('background', 'error', 'Notification title sanitizer failed; using fallback title', {
      tabId: tab.id, site: siteName, error: String(error).slice(0, 160)
    });
  }

  if (clean !== doneBellStableTitle0521(captured, siteName)) {
    await appendLog('background', 'info', 'Notification title sanitized', {
      tabId: tab.id, site: siteName, language, changed: true
    });
  }

  doneBellTitleSnapshots0521.delete(tab.id);
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
