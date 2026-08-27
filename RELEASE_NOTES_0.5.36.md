# DoneBell v0.5.36

Public Beta release consolidating the reliability, playlist, player, routing and update work developed after v0.5.21.

## Audio and playlist
- Multi-track local playlist stored in IndexedDB with no artificial track-count cap; the practical limit is browser storage quota. Individual imported files are limited to 25 MB.
- Random, sequential and fixed-track alert selection, plus per-site and per-tab audio routing with inheritance.
- Full playlist player with previous, play/pause, next, stop, live volume, shuffle without repeats, repeat playlist and repeat one.
- Track seek/progress control and Media Session integration for browser/OS media controls.
- Optional protection so completion alerts do not replace a track already playing.
- Optional protection so closing or stopping a completion notification acknowledges the alert without stopping protected audio.
- Protected completion audio can be adopted into the full player and continue automatically to the next playlist track.
- Folder import, robust bulk import, and settings export/import.

## Reliability and recovery
- Dedicated ChatGPT Stop-control detection avoids false matches from unrelated voice/audio/share controls.
- Reduced ChatGPT mutation-processing overhead and throttled watcher evaluation.
- Completion duplicate guard, self-repairing completion UI/watchdog and stale-completion cleanup when a new generation begins.
- Emergency Stop kills DoneBell audio, notifications, flashing titles, in-page panels and watcher state without deleting settings; Full Reset performs the same stop before clearing settings.
- Live offscreen-audio checks make player-protection decisions resilient to service-worker suspension/restart.
- Unsupported playlist audio falls back safely rather than breaking the watcher.

## Controls and quality of life
- Optional silent alert when the completed tab is already visible.
- Per-site/per-tab mute and audio overrides.
- Now Playing controls in the popup.
- Built-in Self-test covering storage, IndexedDB, offscreen audio, notifications, routing, emergency-stop path, update API and player controller.
- Update-available / What's New UI and manual update check.

## Compatibility and privacy
- Keeps Gemini background completion detection via request lifecycle only; prompts, answers, bodies, headers and cookies are not read.
- Keeps the existing opt-in per-site Auto-Watch permission model and no `<all_urls>` permission.

Internal candidates v0.5.22 through v0.5.35 were development/test builds and were not published as public releases.
