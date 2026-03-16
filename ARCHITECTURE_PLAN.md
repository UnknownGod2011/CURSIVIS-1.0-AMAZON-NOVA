# Cursivis Architecture Plan

## 1. Objectives

Cursivis must deliver a live, runnable Windows demo where Logitech-triggered intent drives AI actions on current on-screen context.

Primary competitions:

- Logitech DevStudio 2026
- Amazon Nova AI Hackathon

Primary demo KPI:

- End-to-end action completes in under 3 seconds for short text on normal network.

## 2. System Components

### A. Logitech Plugin (`plugin/logitech-plugin`)

- Runtime: C# + Logi Actions SDK
- Role:
- Receive trigger actions (`tap`, `long_press`, optional `dial_press`)
- Forward trigger event to companion app over local IPC
- Optional haptic events for success/failure

### B. Companion App (`desktop/cursivis-companion`)

- Runtime: C# + WPF
- Role:
- Detect selection context (text first, lasso second, pixel fallback)
- Render orb/status overlay near cursor
- Execute Smart/Guided interaction flow
- Handle clipboard operations
- Manage onboarding/settings/intent memory
- Call backend and render response UI

### C. Nova Agent Backend (`backend/nova-agent`)

- Runtime: Node.js (Express) for fast hackathon iteration
- Role:
- Analyze text/image/voice transcript
- Infer likely intent
- Return action + result + confidence + alternatives
- Provide strict JSON response contract for companion app

### D. Shared Contracts (`shared/ipc-protocol`)

- JSON schema definitions for:
- Trigger events
- Agent requests
- Agent responses
- Intent memory record model

## 3. Data and Control Flow

## 3.1 Minimal Vertical Slice (MVP-1)

1. User highlights text in any app.
2. User presses mock `MX Trigger` button (later Logitech hardware trigger).
3. Companion app:
- captures selected text
- shows orb: `Analyzing selection...`
4. Companion sends request to backend `/api/intent`.
5. Backend runs Nova 2 Lite summarize action and returns structured JSON.
6. Companion copies `result` to clipboard.
7. Orb shows success; expand panel displays full output.

## 3.2 Full Selection Decision Tree

1. Trigger received.
2. Attempt text selection capture.
3. If text exists:
- Smart mode: auto action + execute
- Guided mode: show dynamic action menu
4. If no text:
- Enter lasso mode and capture region
5. If no lasso region:
- Sample cursor pixel and copy hex color

## 4. IPC Design

## 4.1 Initial Choice

- Local WebSocket for hackathon speed and easier inspection.
- Endpoint (companion host): `ws://127.0.0.1:48711/cursivis-trigger`

Rationale:

- Works for mock UI and plugin with same message format
- Easy to debug with JSON payloads
- Low effort to add event tracing

## 4.2 Future Alternative

- Named Pipe transport adapter can be added later without changing payload schema.

## 5. Mode Model

- `smart`: backend chooses best action automatically
- `guided`: companion asks backend for ranked suggestions; user picks action

Mode persisted locally in companion settings file.

## 6. Intent Memory Model

Local file storage in companion app:

- `data/intent-memory.json`

Keyed by:

- content kind (`text`, `code`, `image`, `product`, etc.)
- chosen action (`summarize`, `translate`, `explain`, ...)

Used for:

- reordering guided suggestions
- optional smart-mode tie-breaker hints

## 7. Security and Reliability

- AWS credentials never hardcoded in companion; only backend holds AWS credentials.
- Companion calls backend with local config URL + auth token support.
- Strict schema validation on backend input/output.
- Timeouts:
- IPC trigger handling timeout: 250 ms
- Backend request timeout: 12 s
- Graceful UI fallback states for failures.

## 8. Observability

- Companion logs:
- trigger received
- selection detection result
- backend latency
- clipboard write result
- Backend logs:
- request id
- selected action
- model latency
- model/provider errors

All logs include `requestId` correlation key.

## 9. Build and Run Topology

Local demo topology:

- Companion app (WPF) runs on Windows desktop.
- Mock trigger button window sends trigger events over local WebSocket.
- Backend service runs locally (dev) or on Cloud Run (demo/stage/prod).

Competition demo topology:

- Logitech plugin replaces mock trigger sender.
- Backend deployed to AWS (ECS/App Runner/EC2).

## 10. Implementation Phases

## Phase 1 (Now): Scaffold + Contracts

- Folder structure
- Architecture plan
- IPC schemas

## Phase 2: Companion MVP

- Mock trigger button
- Text capture flow
- Orb + result panel
- Clipboard integration

## Phase 3: Backend MVP

- `/health` and `/api/intent`
- Nova 2 Lite text summarize action
- Structured response with confidence + alternatives

## Phase 4: Plugin Integration

- Logitech trigger action maps to IPC trigger event
- Optional haptic success/failure

## Phase 5: Multimodal Expansion

- Lasso capture and image analysis
- Long-press voice command mode

## Phase 6: Memory + Polish

- Intent memory ranking
- Guided dynamic menu expansion
- Resilience and UX polish

## 11. Definition of Done for MVP-1

MVP-1 is accepted when all are true:

- Triggering produces visible orb state changes
- Selected text is detected from at least one external app (Notepad/Chrome)
- Backend returns real Nova-generated summary
- Result is copied to clipboard automatically
- Expand panel shows full result text
- No mocked AI output in the success path
