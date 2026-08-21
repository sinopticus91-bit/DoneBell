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

The same behavior can be overridden for individual supported sites.

## Privacy

No `<all_urls>` permission. Manual watching uses temporary `activeTab`; Auto-Watch requests only the site permission you explicitly enable. Diagnostics are prepared locally and are designed not to contain AI prompts or answers.

## Manual installation

Open `edge://extensions/` or `chrome://extensions/`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` directory.

## Feedback

Use **Report a problem** for technical diagnostics, **Suggest an idea** for feature requests, and **♥ Support** to open the configured Boosty page.

---

DoneBell Public Beta · GitHub: `sinopticus91-bit/DoneBell`
