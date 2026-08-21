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
