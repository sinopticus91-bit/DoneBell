# Changelog

## v0.5.6 — Public Beta focus semantics

### Completion acknowledgement
- Explicitly closing/stopping a completion alert now clears the matching system notification as well as the in-page surface and flashing `DONE` title.
- The completion surface is a single high, full-area clickable control with small status/site information above a large `✓ Close` action.
- The in-page completion surface is a singleton and updates in place, preventing duplicate controls during fast audio/focus state changes.

### Tab focus behavior
- **Automatically switch to finished tab** is independent from acknowledgement.
- **Stop the alert when I open the finished tab** applies to manual/user focus.
- New child setting **Also stop if DoneBell switches to it automatically**, off by default.
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
