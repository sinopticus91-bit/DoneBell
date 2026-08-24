# DoneBell Privacy Policy — Public Beta v0.5.18

DoneBell is designed to work locally and to request only the browser access needed for its task-finish alerts.

## Single purpose

DoneBell notifies the user when a watched browser task finishes. It can detect completion on supported AI services or watch a page element selected by the user.

## Browser access

- DoneBell does **not** request `<all_urls>`.
- Manual watching uses the temporary `activeTab` permission after the user explicitly opens DoneBell on a tab.
- Auto-Watch is opt-in per site. Enabling it requests persistent access only to the listed origin(s) of that specific service.
- Disabling Auto-Watch removes those optional origin permissions.
- DoneBell uses the `scripting` permission only to run its bundled detection code on a user-selected or Auto-Watch-enabled site.
- DoneBell uses the `webRequest` permission only for Gemini background-completion detection. While a Gemini task is actively watched, DoneBell observes the lifecycle of the specific `StreamGenerate` request because Gemini can delay DOM/UI updates in a background tab.
- The Gemini network detector does **not** read request or response bodies, headers, cookies, prompts, answers, or other conversation content. It uses only request lifecycle/status/timing information needed to detect completion.

## Local data

DoneBell stores settings, per-site overrides, Auto-Watch preferences, appearance/language preferences, local diagnostic logs, and an optional user-selected alert audio file in browser extension storage.

DoneBell does not require a DoneBell account or backend for normal operation.

## Website content and browsing activity

To detect task state, DoneBell may locally inspect limited page UI metadata such as Stop/Cancel controls, accessibility labels, selected-element state, page title, site identity, and URL/path.

DoneBell is not designed to collect AI prompts or answers.

## Diagnostics and feedback

Diagnostic reports are prepared locally only when the user chooses to copy/download them or report a problem. They may include:

- DoneBell and browser version;
- current site identity and watcher state;
- DoneBell settings and permission state;
- technical detection events and limited UI-control metadata.

Diagnostic reports are **not sent automatically**. Sharing occurs only after an explicit user action, for example by opening a GitHub issue.

## Custom audio

Custom alert audio selected by the user is stored locally and is used only for DoneBell alert playback.

## Remote code and data transfer

DoneBell ships its executable code with the extension and does not load remote executable code.

Normal DoneBell operation does not send user data to Generion Lab. External pages such as GitHub or the optional support page open only after an explicit user action.

## Chrome Web Store Limited Use

DoneBell's use of information received from Chrome APIs is limited to providing and improving the user-facing task-finish alert functionality and follows the Chrome Web Store User Data Policy, including Limited Use requirements.
