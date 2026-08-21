# 🔔 DoneBell

**Public Beta · v0.5.6 · Chrome / Edge**

[EN](README_EN.md) · [RU](README_RU.md) · [ES](README_ES.md) · [DE](README_DE.md) · [FR](README_FR.md) · [PT-BR](README_PT_BR.md) · [简中](README_ZH_CN.md) · [繁中](README_ZH_TW.md) · [JA](README_JA.md) · [KO](README_KO.md) · [AR](README_AR.md) · [HI](README_HI.md) · [ID](README_ID.md) · [TR](README_TR.md) · [IT](README_IT.md) · [PL](README_PL.md) · [UK](README_UK.md) · [VI](README_VI.md)

DoneBell tells you when a long-running task in a browser tab is finished, so you do not have to keep checking it manually.

It includes AI-aware completion detection for popular chat interfaces and a universal element watcher for other web tools.

## Highlights

- AI completion watching for ChatGPT, Claude, Gemini and DeepSeek, plus generic detection for additional AI sites.
- Universal element watcher: wait for an element to disappear, become hidden, change text, become enabled or become disabled.
- Built-in bell or your own local audio file, live volume control and optional repeat-until-acknowledged.
- System notification, flashing `DONE` title and a large in-page completion control.
- Global alert profiles plus per-site overrides.
- Optional Auto-Watch with per-site browser permissions and no `<all_urls>`.
- 18 UI languages and appearance customization.
- Local diagnostics plus GitHub bug/feature reporting.
- Optional support link through Boosty; DoneBell never processes payments itself.

## Tab focus behavior in v0.5.6

Three behaviors are intentionally separate:

1. **Automatically switch to the finished tab.**
2. **Stop the alert when I open the finished tab myself.**
3. **Also stop if DoneBell switches to it automatically** — an opt-in child setting, off by default.

This means DoneBell can bring a result to the front while the alert keeps playing until you explicitly acknowledge it, or it can treat the automatic switch as acknowledgement if you prefer.

The same behavior can be overridden for individual supported sites.

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

Generic integrations are beta compatibility and may need retesting after site UI changes.

## Privacy by design

- No `<all_urls>` permission.
- Manual watching uses temporary `activeTab` access after an explicit click.
- Auto-Watch is opt-in per site and requests persistent access only for that site's listed origin(s).
- Turning Auto-Watch off removes that site's origin permission.
- Settings, diagnostics and custom alert audio stay in browser extension storage.
- No DoneBell account or backend is required.
- Bug reports are prepared locally and shared only after an explicit user action.
- Diagnostic reports are designed not to include AI prompt/answer text.

See [PRIVACY.md](PRIVACY.md).

## Manual installation

1. Download or clone this repository.
2. Open `edge://extensions/` or `chrome://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension/` directory.
6. Pin DoneBell to the toolbar if desired.

## Feedback

- **🐞 Report a problem** prepares local diagnostics and opens a GitHub issue.
- **💡 Suggest an idea** opens a feature request.
- **♥ Support** opens the configured Boosty donation page only after you click it.

Please do not paste private conversation content into public issues.

## License

No open-source license has been selected yet. Until a license is added, the source is published for beta transparency and standard copyright restrictions apply.
