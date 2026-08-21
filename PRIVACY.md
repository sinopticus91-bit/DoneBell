# DoneBell Privacy Policy — Public Beta v0.5.8

DoneBell is designed to work locally and to minimize browser permissions and data exposure.

## Single purpose

DoneBell alerts users when a long-running browser task finishes. It does this by detecting completion signals on supported AI chat interfaces or by monitoring a page element explicitly selected by the user.

## Browser access

- DoneBell does **not** request `<all_urls>`.
- Manual AI watching and the universal element picker use temporary `activeTab` access after the user explicitly activates DoneBell on a tab.
- Auto-Watch is opt-in per site. Enabling it requests persistent access only for the listed origin(s) of that specific site.
- Disabling Auto-Watch removes those origin permissions again.
- DoneBell uses only JavaScript and other code bundled with the extension package. It does not download or execute remote code.

## User data handled by DoneBell

DoneBell may locally process the following categories of user data only as needed for its user-facing completion-watching features:

### Web browsing activity

DoneBell reads the current tab's site identity, URL/path, and page title so it can associate a watcher with the correct tab/site, preserve or cancel a watcher across navigation, label completion alerts, and prepare local diagnostics.

DoneBell does not build a browsing-history profile and does not transmit browsing activity to Generion Lab.

### Website content

DoneBell inspects limited page content and UI metadata to detect task state, such as Stop/Cancel controls, accessibility labels, selected element state, and—in universal element-watch mode—the text or state of the element explicitly selected by the user.

DoneBell is not designed to collect AI prompts or AI answers. Its diagnostics are designed to avoid including conversation text.

### User interaction during the element picker

While the user has explicitly opened the universal element picker, DoneBell temporarily observes pointer movement, a click used to select the target element, and the Escape key used to cancel the picker. These interaction events are used only to operate the picker and are not stored as an activity history or transmitted to Generion Lab.

## Local storage

DoneBell stores the following in browser extension storage as needed for its features:

- alert settings and volume;
- per-site overrides and Auto-Watch preferences;
- appearance and language preferences;
- watcher state required to survive same-site navigation/reloads;
- local diagnostic logs;
- an optional custom alert audio file selected by the user.

DoneBell does not require a DoneBell account or a Generion Lab backend for normal operation.

## Diagnostics and feedback

The extension can prepare a technical diagnostic report locally when the user explicitly chooses to report a problem. The report may include:

- DoneBell version;
- browser name/version;
- current site identity and page path;
- watcher mode/state;
- DoneBell settings and per-site overrides;
- permission state;
- DoneBell diagnostic log and UI-control metadata used for completion detection.

No diagnostic report is sent automatically. The user must explicitly copy, download, or share a report. Opening the GitHub bug-report flow does not silently upload diagnostics.

## Custom audio

Custom alert audio selected by the user is stored locally in browser extension storage and is used only for DoneBell alert playback.

## Support link

The optional **Support** button opens the configured external Boosty page only after an explicit user click. DoneBell does not process payment data and does not receive payment details inside the extension.

## Data sharing and sale

Generion Lab does not sell DoneBell user data.

DoneBell does not transmit browsing activity, website content, picker interaction data, settings, diagnostics, or custom audio to Generion Lab during normal operation.

User data is not used for advertising, creditworthiness, lending, or purposes unrelated to DoneBell's single purpose.

Any information a user chooses to share manually through an external service such as GitHub or Boosty is governed by that service's own privacy practices.

## Chrome Web Store Limited Use

DoneBell's use of information received from Chrome APIs is limited to providing and improving DoneBell's disclosed single purpose and user-facing features. DoneBell complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Future changes

The current Public Beta has no active report API or telemetry backend. If DoneBell introduces new data-handling practices in the future, the extension, store disclosures, and this privacy policy will be updated before those practices are enabled.

## Contact

For privacy questions or bug reports, use the public project repository:

https://github.com/sinopticus91-bit/DoneBell
