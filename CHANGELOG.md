# Changelog

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
- Reserved support/donation destination (disabled until configured).
- Explicit Stop Sound now also acknowledges completion and clears the flashing DONE state.
- Larger in-page Stop Sound target.

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
