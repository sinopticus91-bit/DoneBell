# Changelog

## v0.5.36 — Playlist player, audio routing and reliability release

### Playlist and player
- Added a multi-track local playlist stored in IndexedDB, folder/bulk import and no artificial track-count cap.
- Added random, sequential and fixed-track alert selection with per-site and per-tab inheritance.
- Added a full player with previous/play-pause/next/stop, volume, seek/progress, shuffle without repeats, repeat playlist and repeat one.
- Added Media Session controls so browser/OS Previous, Next and seek actions control DoneBell playback.
- Added protected playback so completion alerts and their Close/Stop controls can acknowledge a task without interrupting music.
- Protected completion audio can continue through the full player and automatically advance to the next track.

### Reliability
- Added a dedicated ChatGPT generation Stop detector to avoid unrelated voice/audio/share controls.
- Reduced ChatGPT mutation-observer work and throttled evaluations.
- Added duplicate-completion protection, completion UI/watchdog recovery and stale-completion cleanup.
- Added Emergency Stop and strengthened Full Reset.
- Player protection now checks the live offscreen audio state across service-worker suspension/restart.

### Quality of life
- Added silent-when-active, per-site/per-tab mute, Now Playing controls, settings export/import and Self-test.
- Added update-available / What's New UI and a manual update check.

`0.5.22` through `0.5.35` were internal development/test candidates and were not published as public releases.

## v0.5.21 — Notification title cleanup and watcher-safe recovery

### ChatGPT notifications
- Snapshot a stable tab title when a watch is armed and refresh it when an AI generation enters the busy state.
- For ChatGPT on non-CJK DoneBell UI languages, remove only a suspicious whitespace-separated trailing CJK-only fragment from an otherwise normal notification title.
- Chinese, Japanese and Korean DoneBell UI languages keep CJK titles unchanged.
- Notification-title cleanup is best-effort and fail-open; it cannot block completion alerts.

### Watcher reliability
- Kept the fix outside the watcher startup/evaluation path so notification cleanup cannot prevent a watcher from arming.
- Preserved the existing detector, audio, focus, navigation, permissions and split-i18n behavior from v0.5.18.

`0.5.19` and `0.5.20` were internal test candidates while this fix was being validated and were not published as public releases.

## v0.5.18 — Gemini background completion and Copilot compatibility

### Gemini
- Added background-tab completion detection based on Gemini's dedicated `BardFrontendService/StreamGenerate` request lifecycle.
- DoneBell can now alert while Gemini is hidden even when Gemini delays its DOM/UI completion state until the tab is foregrounded.
- Network bodies, headers, cookies, prompts and answers are not read.
- Removed noisy diagnostic experiments used while isolating the Gemini background-tab behavior.

### Microsoft Copilot
- Added current Copilot entry points including `www.copilot.com`, `m365.cloud.microsoft` and `copilot.cloud.microsoft`.
- Added localized Stop-control matching including Russian `Прекратить создание`.
- Confirmed working completion detection on `www.copilot.com` and `m365.cloud.microsoft` during manual testing.

### Compatibility validation
- Manually rechecked ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity, Microsoft Copilot, Poe and Le Chat/Mistral.
- Generic integrations remain beta compatibility because third-party AI sites can change their interfaces without notice.

### Privacy / permissions
- Added the `webRequest` permission for Gemini background-completion detection.
- Manual watching still relies on temporary `activeTab` access.
- Auto-Watch remains opt-in and site-scoped through `optional_host_permissions`.

## v0.5.6 — Public Beta focus semantics

### Completion acknowledgement
- Explicitly closing/stopping a completion alert clears the matching system notification as well as the in-page surface and flashing `DONE` title.
- The completion surface is a single high, full-area clickable control with small status/site information above a large `✓ Close` action.
- The in-page completion surface is a singleton and updates in place, preventing duplicate controls during fast audio/focus state changes.

### Tab focus behavior
- **Automatically switch to finished tab** is independent from acknowledgement.
- **Stop the alert when I open the finished tab** applies to manual/user focus.
- Added child setting **Also stop if DoneBell switches to it automatically**, off by default.
- The child setting is also available in per-site Custom overrides.
- Auto-focused tabs no longer accidentally silence their own alert unless the child setting is enabled.
- When DoneBell auto-focuses a completed tab, a redundant system notification is suppressed because the in-page completion control is already visible.

### Documentation
- Added README variants for all 18 current UI languages.
- Updated Public Beta privacy notes and support documentation.

## v0.5.1 — Support link

- Connected the public Boosty donation page.
- Moved the opt-in support control into the header as a small blue button between the DoneBell brand and Public Beta label.
- Removed the duplicate support button from the bottom of the popup.
- Clicking Support only opens Boosty in a new tab; DoneBell does not process payments itself.

## v0.5.0 — Public Beta

First public-beta source release.

### Feedback and support shell
- Local bug-report preparation and GitHub feedback integration.
- Feature-request entry point.
- Explicit Stop Sound acknowledges completion and clears the flashing DONE state.
- In-page completion acknowledgement control.

### Watchers and compatibility
- AI completion watcher.
- Universal element watcher.
- Built-in support for ChatGPT, Claude, and Gemini.
- Dedicated DeepSeek SVG-state detector.
- Generic detector support for additional AI sites.
- Auto-Watch with per-site optional host permissions and no `<all_urls>`.
- Same-site SPA navigation/reload resilience.

### Alerts
- Built-in and custom audio.
- Live volume updates.
- Repeat-until-stopped mode.
- System notifications.
- Optional finished-tab focus.
- Optional stop-on-tab-focus.
- DONE title flashing and in-page acknowledgement control.
- Global profiles plus per-site overrides.

### UI
- Bright toolbar icon optimized for small browser toolbar sizes.
- Calm outward pulse for an armed AI watcher.
- Appearance customization, including font, font size, background/accent colors, and detector badge colors.
- 18 UI languages.
