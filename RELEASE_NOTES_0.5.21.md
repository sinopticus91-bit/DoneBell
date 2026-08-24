# DoneBell v0.5.21 — notification title cleanup + watcher-safe hotfix

- Fixed ChatGPT completion notifications that could inherit an unrelated trailing CJK-looking fragment from the page title.
- DoneBell now snapshots a stable tab title when a watch is armed / generation enters the busy state and prefers that snapshot for the completion notification.
- For non-CJK DoneBell UI languages, only a whitespace-separated trailing CJK-only fragment is removed, and only for ChatGPT.
- Chinese, Japanese and Korean DoneBell UI languages keep CJK titles unchanged.
- The fix is isolated in the background notification layer so it cannot interfere with watcher startup or completion detection.
- Title cleanup is fail-open: if sanitization ever fails, the alert is still shown with the unsanitized stable title.

`0.5.19` and `0.5.20` were internal test candidates and were not published as public releases.
