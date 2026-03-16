# Cursivis

Windows-first cursor-native AI interaction system for Logitech + Gemini.

This repository is organized for parallel development of:

- Logitech trigger integration (`plugin/logitech-plugin`)
- Windows companion app (`desktop/cursivis-companion`)
- Local browser action executor (`desktop/browser-action-agent`)
- Gemini backend service (`backend/gemini-agent`)
- Shared cross-component contracts (`shared/ipc-protocol`)

## Current Status

Companion + backend + trigger bridge are implemented for a runnable functional demo:

- Mock console trigger panel in WPF
- External trigger IPC over local WebSocket
- Text selection capture, lasso screenshot capture, pixel HEX fallback
- Smart/Guided modes with first-run mode selection and persisted preference
- Gemini-backed text/image analysis with Gemini-first intent routing
- Text selections can optionally include a captured visual screen context, enabling combined text + image reasoning
- Guided mode progressive menu (`...`) with dynamic context options + custom voice
- Long-press hold-to-record voice capture + backend transcription pipeline
- Optional Gemini Live API realtime voice path with interruption-friendly transcription fallback
- Optional streaming-style partial transcription during long capture (`CURSIVIS_ENABLE_STREAMING_TRANSCRIPTION=true`)
- Hybrid output behavior: always copies to clipboard; Smart mode can also auto-replace selected text for safe action types at high confidence
- Post-result `Take Action` flow for browser-first agent execution (fill forms, check MCQs, draft/send email flows, apply generated output to live pages)
- Chromium extension + native messaging host path for acting inside the user's real logged-in current browser tab instead of only the managed automation browser
- Action preview + one-click undo for auto-replace and browser execution flows
- Browser task-pack guidance for Gmail/mail, Discord, Google Forms, Docs, Notion, and shopping pages
- Clipboard auto-copy + insert + result panel
- Dial-driven action ring
- Intent memory ranking for repeated action choices
- Logitech trigger paths:
- `plugin/logitech-plugin/src/Cursivis.Logitech.Bridge` (runnable bridge)
- `plugin/logitech-plugin/src/CursivisPlugin` (Logi SDK plugin scaffold)

## Folder Layout

```text
cursivis/
  ARCHITECTURE_PLAN.md
  docs/
  plugin/
    logitech-plugin/
  desktop/
    cursivis-companion/
    browser-action-agent/
  backend/
    gemini-agent/
  shared/
    ipc-protocol/
```

## Quick Start

1. Set `GOOGLE_API_KEY` in your terminal environment.
2. Run:

```powershell
Set-Location -LiteralPath "C:\Users\Admin\OneDrive\Desktop\Cursivis! - Copy\cursivis"
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 -WithBridge -ApiKey "<YOUR_GOOGLE_API_KEY>" -EnableStreamingTranscription
```

`run-demo.ps1` now performs pre-launch cleanup by default, starts backend + browser action agent + companion (+ optional bridge), checks health, and warms the managed browser session used by `Take Action`.

To enable `Take Action` inside your real logged-in Chromium-family browser tabs:

1. Load the unpacked extension from [desktop/browser-extension-chromium/README.md](/C:/Users/Admin/OneDrive/Desktop/Cursivis!%20-%20Copy/cursivis/desktop/browser-extension-chromium/README.md).
2. Copy the extension ID.
3. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-browser-bridge.ps1 -ExtensionId "<EXTENSION_ID>"
```

4. Restart the browser and keep the target tab active when you use `Take Action`.

Optional companion env flags:

- `CURSIVIS_ENABLE_STREAMING_TRANSCRIPTION=true`
- `CURSIVIS_ENABLE_TEXT_SCREEN_CONTEXT=true`
- `CURSIVIS_TEXT_SCREEN_CONTEXT_WIDTH=480`
- `CURSIVIS_TEXT_SCREEN_CONTEXT_HEIGHT=320`
- `CURSIVIS_MAX_VOICE_SECONDS=45`
- `CURSIVIS_STREAM_PROBE_SECONDS=2`
- `CURSIVIS_VOICE_CONFIRM=false`
- `CURSIVIS_ENABLE_AUTO_REPLACE=true`
- `CURSIVIS_AUTO_REPLACE_CONFIDENCE=0.90`
- `CURSIVIS_ENABLE_AUTO_TAKE_ACTION=true`
- `CURSIVIS_ENABLE_VOICE_ACTION_HANDOFF=true`
- `CURSIVIS_ENABLE_LIVE_API_VOICE=true`
- `CURSIVIS_EXTENSION_BRIDGE_URL=http://127.0.0.1:48830`

Stop all demo components:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

Quick backend smoke test:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -ApiKey "<YOUR_GOOGLE_API_KEY>"
```
