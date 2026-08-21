# DoneBell Privacy Notes — Public Beta v0.5.6

DoneBell is designed to work locally and to minimize browser permissions.

## Browser access

- DoneBell does **not** request `<all_urls>`.
- Manual AI watching and the universal element picker use temporary `activeTab` access after the user explicitly clicks DoneBell.
- Auto-Watch is opt-in per site. Enabling it requests persistent access only for the listed origin(s) of that specific site.
- Disabling Auto-Watch removes those origin permissions again.

## Local data

DoneBell stores settings, diagnostic logs, site overrides, appearance preferences, and optional custom alert audio in browser extension storage.

DoneBell does not require a DoneBell account or backend for normal operation.

## Diagnostics and feedback

The extension can prepare a technical diagnostic report locally when the user chooses to report a problem. The report may include:

- DoneBell version;
- browser name/version;
- current site identity;
- watcher mode/state;
- DoneBell settings and per-site overrides;
- permission state;
- DoneBell diagnostic log and UI-control metadata used for detection.

The diagnostic system is designed not to collect AI prompt or answer text.

No diagnostic report is sent automatically. Sharing happens only after an explicit user action, such as copying the report or opening a GitHub issue.

## Custom audio

Custom alert audio selected by the user is stored locally in browser extension storage and is used only for DoneBell alert playback.

## Support link

The optional **Support** button opens the configured external Boosty page only after an explicit user click. DoneBell does not process payment data and does not receive payment details inside the extension.

## Future report API

The source contains a reserved `reportApiEndpoint` field for a possible future opt-in reporting endpoint. It is empty in the current Public Beta and no report API is active. Any future endpoint would require a separate privacy review and explicit browser host permission.
