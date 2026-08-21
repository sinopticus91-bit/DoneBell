# 🔔 DoneBell

**Public Beta · v0.5.1 · Chrome / Edge**

DoneBell tells you when a long-running task in a browser tab is finished, so you do not have to keep checking the tab.

It includes AI-aware completion detection for popular chat interfaces and a universal element watcher for other web tools.

[Русская версия README](README_RU.md)

## What DoneBell can do

- Watch AI generation and alert when it finishes.
- Watch any selected page element until it disappears, becomes hidden, changes text, becomes enabled, or becomes disabled.
- Play the built-in bell or a local custom audio file.
- Change volume live while an alert is playing.
- Repeat alerts until acknowledged.
- Show a Windows/browser notification.
- Flash `DONE` in the tab title.
- Optionally switch to the completed tab.
- Optionally stop the alert when the completed tab becomes active.
- Show an in-page **Stop sound** control for explicit acknowledgement.
- Use global alert profiles or per-site overrides.
- Auto-Watch supported sites after explicit per-site permission.
- Customize fonts, colors, detector badges, and UI language.
- Prepare a local diagnostic report for bug reports.

## AI compatibility

| Site | Detector |
| --- | --- |
| ChatGPT | Built-in |
| Claude | Built-in |
| Gemini | Built-in |
| DeepSeek | Dedicated SVG-state detector |
| Grok | Generic AI detector |
| Perplexity | Generic AI detector |
| Microsoft Copilot | Generic AI detector |
| Poe | Generic AI detector |
| Le Chat | Generic AI detector |
| You.com | Generic AI detector |

Generic integrations are intentionally treated as beta compatibility and may need retesting when a site changes its UI.

## Privacy by design

DoneBell is designed to request as little browser access as practical.

- No `<all_urls>` permission.
- Manual watching uses temporary `activeTab` access after you click the extension.
- Auto-Watch is opt-in per site and requests persistent access only for that site's listed origin(s).
- Turning Auto-Watch off removes that site's origin permission again.
- Settings, diagnostics, and custom alert audio stay in browser extension storage.
- No DoneBell account or backend is required.
- Bug reports are prepared locally and are shared only after an explicit user action.
- Diagnostic reports are designed not to include AI prompt/answer text.

See [PRIVACY.md](PRIVACY.md) for the current beta privacy notes.

## Install the Public Beta manually

Until the store builds are published:

1. Download or clone this repository.
2. Open `edge://extensions/` or `chrome://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension/` directory from this repository.
6. Pin DoneBell to the browser toolbar if you want quick access.

For a manual update, replace the local files with the newer release and press **Reload** on the browser extensions page.

## Feedback

DoneBell is in Public Beta. UI changes on AI sites can break detectors, so real-world reports are useful.

- Use **🐞 Report a problem** in DoneBell to prepare diagnostics and open a GitHub issue.
- Use **💡 Suggest an idea** for feature requests.
- Or open an issue directly in this repository.

Please do not paste private conversation content into public issues.

## Languages

The current UI includes 18 languages:

English, Russian, Spanish, German, French, Portuguese (Brazil), Simplified Chinese, Traditional Chinese, Japanese, Korean, Arabic, Hindi, Indonesian, Turkish, Italian, Polish, Ukrainian, and Vietnamese.

Translations are beta-quality and community corrections are welcome through Issues.

## Repository layout

```text
extension/              Browser-extension source
.github/ISSUE_TEMPLATE/ Bug and feature request forms
README.md               English project overview
README_RU.md            Russian project overview
PRIVACY.md              Privacy notes
CHANGELOG.md             Public beta changelog
```

## License

No open-source license has been selected yet. Until a license is added, the source is published for beta transparency and the usual copyright restrictions apply.
