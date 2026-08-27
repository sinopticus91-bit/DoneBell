# 🔔 DoneBell

**Public Beta · v0.5.36 · Chrome / Edge**

[EN](README_EN.md) · [RU](README_RU.md) · [ES](README_ES.md) · [DE](README_DE.md) · [FR](README_FR.md) · [PT-BR](README_PT_BR.md) · [简中](README_ZH_CN.md) · [繁中](README_ZH_TW.md) · [JA](README_JA.md) · [KO](README_KO.md) · [AR](README_AR.md) · [HI](README_HI.md) · [ID](README_ID.md) · [TR](README_TR.md) · [IT](README_IT.md) · [PL](README_PL.md) · [UK](README_UK.md) · [VI](README_VI.md)

DoneBell tells you when a long-running task in a browser tab finishes, so you can leave the tab and come back when the result is ready.

It combines AI-aware completion detection with a universal element watcher for other long-running web tools.

## Highlights

- AI completion watching for ChatGPT, Claude, Gemini and DeepSeek, plus generic compatibility for Grok, Perplexity, Microsoft Copilot, Poe, Le Chat/Mistral and You.com.
- Gemini background-tab completion detection using the lifecycle of Gemini's dedicated `StreamGenerate` request when DOM updates are delayed in hidden tabs.
- Universal element watcher: wait for an element to disappear, become hidden, change text, become enabled or become disabled.
- Built-in bell or a large local playlist stored in browser IndexedDB.
- Full playlist player: previous, play/pause, next, stop, volume, seek/progress, shuffle without repeats, repeat playlist and repeat one.
- Random, sequential and fixed-track alert selection with per-site and per-tab audio routing.
- Optional protection so completion alerts and their Close/Stop controls do not interrupt music already playing.
- Folder import, robust bulk import and settings export/import.
- Emergency Stop, duplicate-completion protection, watcher recovery and a built-in Self-test.
- Update-available / What's New UI and manual update checking.
- System notifications, flashing `DONE` title and an in-page completion control.
- Global alert profiles plus per-site overrides.
- Optional Auto-Watch with per-site browser permissions and no `<all_urls>`.
- 18 UI languages and appearance customization.
- Local diagnostics plus GitHub bug/feature reporting.

## AI compatibility

| Site | Detector / status |
| --- | --- |
| ChatGPT | Built-in |
| Claude | Built-in |
| Gemini | Built-in + background `StreamGenerate` completion |
| DeepSeek | Dedicated SVG-state detector |
| Grok | Generic AI detector · beta compatibility |
| Perplexity | Generic AI detector · beta compatibility |
| Microsoft Copilot | Generic AI detector · beta compatibility |
| Poe | Generic AI detector · beta compatibility |
| Le Chat / Mistral | Generic AI detector · beta compatibility |
| You.com | Generic AI detector · beta compatibility |

Generic integrations are beta compatibility and may need retesting after site UI changes.

## Privacy by design

- No `<all_urls>` permission.
- Manual watching uses temporary `activeTab` access after an explicit click.
- Auto-Watch is opt-in per site and requests persistent access only for that site's listed origin(s).
- Turning Auto-Watch off removes that site's origin permission.
- `webRequest` is used only for Gemini background-completion detection while Gemini is actively watched. DoneBell observes request lifecycle/status/timing only; it does not read network bodies, headers, cookies, prompts or answers.
- Settings, diagnostics and local playlist audio stay in browser extension storage.
- No DoneBell account or backend is required.
- Bug reports are prepared locally and shared only after an explicit user action.

See [PRIVACY.md](PRIVACY.md).

## Manual installation

1. Download or clone this repository.
2. Open `edge://extensions/` or `chrome://extensions/`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extension/` directory.
6. Pin DoneBell to the toolbar if desired.

## Feedback

- **Report a problem** prepares local diagnostics and opens a GitHub issue.
- **Suggest an idea** opens a feature request.
- **Support** opens the configured Boosty donation page only after you click it.

If something breaks on an AI site, attaching DoneBell diagnostics to the issue is the fastest way to make the report actionable. Please do not paste private conversation content into public issues.

## Release notes

See [RELEASE_NOTES_0.5.36.md](RELEASE_NOTES_0.5.36.md) and [CHANGELOG.md](CHANGELOG.md).

## License

No open-source license has been selected yet. Until a license is added, the source is published for beta transparency and standard copyright restrictions apply.
