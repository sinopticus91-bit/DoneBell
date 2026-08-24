# DoneBell v0.5.18 — Public Beta

## Highlights

- Fixed Gemini background-tab completion detection.
  - DoneBell now correlates Gemini's visible generation state with the browser lifecycle of its dedicated `BardFrontendService/StreamGenerate` request.
  - This allows alerts to fire while Gemini is in a background tab even when Gemini delays its DOM/UI update until the tab is opened again.
  - Request/response bodies, headers, cookies, prompts and answers are not read.
- Updated Microsoft Copilot compatibility.
  - Added current consumer and Microsoft 365 Copilot hosts.
  - Added localized Stop-control detection including Russian `Прекратить создание`.
- Confirmed manual compatibility during testing with ChatGPT, Claude, Gemini, DeepSeek, Grok, Perplexity, Microsoft 365 Copilot, Poe and Le Chat/Mistral.
- Reduced diagnostic noise from Gemini/Copilot test instrumentation.

## Supported Copilot entry points

- `https://www.copilot.com/`
- `https://m365.cloud.microsoft/`

`copilot.microsoft.com` remains listed as a compatibility/redirect entry point but may behave differently depending on Microsoft's current rollout.

## Privacy / permission change

v0.5.18 adds the `webRequest` permission for Gemini completion detection. It is used only to observe the lifecycle/status/timing of Gemini's dedicated generation request while Gemini is being watched. DoneBell does not inspect network bodies, headers, cookies, prompts or answers.

Manual watching still uses temporary `activeTab` access. Auto-Watch remains opt-in and site-scoped.
