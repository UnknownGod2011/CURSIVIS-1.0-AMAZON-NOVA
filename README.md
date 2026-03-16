# Cursivis

Windows-first cursor-native AI interaction system for Logitech + Amazon Nova.

This repository is organized for parallel development of:

- Logitech trigger integration (`plugin/logitech-plugin`)
- Windows companion app (`desktop/cursivis-companion`)
- Local browser action executor (`desktop/browser-action-agent`)
- Nova agent backend (`backend/nova-agent`)
- Shared cross-component contracts (`shared/ipc-protocol`)

## Current Status

Companion + backend + trigger bridge are implemented for a runnable functional demo:

- Mock console trigger panel in WPF
- External trigger IPC over local WebSocket
- Text selection capture, lasso screenshot capture, pixel HEX fallback
- Smart/Guided modes with first-run mode selection and persisted preference
- Nova-backed text/image analysis with Nova-first intent routing
- Text selections can optionally include a captured visual screen context, enabling combined text + image reasoning
- Guided mode progressive menu (`...`) with dynamic context options + custom voice
- Long-press hold-to-record voice capture + backend transcription pipeline
- Optional Nova 2 Sonic realtime voice path with interruption-friendly transcription fallback
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
    nova-agent/
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

1. Load or reload the unpacked extension from [desktop/browser-extension-chromium/README.md](desktop/browser-extension-chromium/README.md).
2. Refresh the target Gmail / Google Form / web app tab once after the extension loads.
3. Keep the target tab active when you use `Take Action`.

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

## Reproducible Testing

These instructions are written for judges so the project can be reproduced and tested quickly.

### Prerequisites

- Windows 10 or 11
- .NET 8 SDK
- Node.js 20+
- Google Gemini API key
- Chrome, Edge, Brave, or another Chromium-family browser for real-tab `Take Action`

### One-Time Setup

1. Clone the repo.
2. Open a PowerShell terminal in the repo root.
3. Load the unpacked browser extension from [desktop/browser-extension-chromium/README.md](desktop/browser-extension-chromium/README.md) if you want `Take Action` to run inside your already logged-in browser tab.

### Start The Full Local Demo

```powershell
Set-Location -LiteralPath "C:\Users\Admin\OneDrive\Desktop\Cursivis! - Copy\cursivis"
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 -WithBridge -ApiKey "<YOUR_GOOGLE_API_KEY>" -EnableStreamingTranscription
```

What this launches:

- Gemini backend
- browser action agent
- browser extension bridge host
- WPF companion app
- optional Logitech bridge when `-WithBridge` is used

### Fast Health / Smoke Test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 -ApiKey "<YOUR_GOOGLE_API_KEY>"
```

### Manual Judge Test Flows

1. Smart text flow
   - Select a long article or report and press `Trigger`.
   - Expected: Cursivis returns a useful summary or insight-oriented response.
2. Image flow
   - Use lasso selection on an image and press `Trigger`.
   - Expected: Cursivis describes or analyzes the selected image region.
3. Voice flow
   - Hold `Hold to Talk`, speak, then pause for 1-2 seconds.
   - Expected: the orb glows while listening, voice is transcribed, and the result is generated against the current selection.
4. Google Form / MCQ flow
   - Select the questions, press `Trigger`, then press `Take Action`.
   - Expected: answer choices and text fields are filled in the active logged-in browser tab.
5. Email reply flow
   - Select an email thread, press `Trigger`, then press `Take Action`.
   - Expected: a reply draft is inserted into the active mail composer.

### Helpful Hotkeys

- `Ctrl+Alt+Space` = Trigger
- `Ctrl+Alt+A` = Take Action
- `Ctrl+Alt+V` = Voice

## Architecture Diagram

- Primary diagram image: [docs/ARCHITECTURE_DIAGRAM_CHATGPT.png](docs/ARCHITECTURE_DIAGRAM_CHATGPT.png)
- Alternate vector diagram: [docs/ARCHITECTURE_DIAGRAM.svg](docs/ARCHITECTURE_DIAGRAM.svg)
- Diagram notes: [docs/ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md)

## Google Cloud Deployment

The Gemini backend can be deployed to Google Cloud Run without changing the local working version you use for demos.

- Deployment guide: [docs/DEPLOYMENT_GCLOUD.md](docs/DEPLOYMENT_GCLOUD.md)
- Automated deploy script: [scripts/deploy-cloudrun.ps1](scripts/deploy-cloudrun.ps1)
- Container source: [backend/gemini-agent/Dockerfile](backend/gemini-agent/Dockerfile)

Important: local demos continue using `http://127.0.0.1:8080` by default. The cloud backend is only used when you explicitly launch the companion with `-BackendUrl "<CLOUD_RUN_URL>"`.
