# Gemini Agent Backend

## Purpose

Provide structured Gemini-powered reasoning and transformation endpoints for companion requests.

## Initial API

- `GET /health`
- `POST /api/intent`

## Input Types

- selected text
- screenshot image payload (phase 5)
- voice transcript (phase 5)

## Response Contract

```json
{
  "requestId": "uuid",
  "action": "summarize",
  "result": "string",
  "confidence": 0.91,
  "alternatives": ["translate", "explain"],
  "latencyMs": 1240
}
```

## Status

Implemented Node/Express backend in `src/`.

## Endpoints

- `GET /health`
- `POST /analyze`
- `POST /api/intent` (alias of `/analyze`)
- `POST /suggest-actions`
- `POST /transcribe`
- `POST /plan-browser-action`
- `WS /live` (Gemini Live API voice gateway)

`/analyze` supports:

- `selection.kind = "text"` for text analysis/rewrite/translate/explain/bullets
- `selection.kind = "text_image"` for multimodal text + screenshot reasoning
- additional structured actions (`explain_code`, `debug_code`, `optimize_code`, `compare_prices`, etc.)
- `selection.kind = "image"` for lasso screenshot analysis
- optional `voiceCommand` to apply long-press instruction behavior

`/suggest-actions` returns:

- `contentType`
- `recommendedAction`
- `alternatives`
- `extendedAlternatives` (dynamic, Gemini-generated contextual options for `...` menu)
- `bestAction` and `confidence`

`/transcribe` accepts recorded audio (`audioBase64`, `mimeType`) and returns transcription text for long-press voice command flow.

`/live` provides a websocket bridge for realtime voice sessions backed by Gemini Live API. The companion can stream microphone chunks and receive incremental transcription / interruption events, while still falling back to `/transcribe` if Live API is unavailable.

`/plan-browser-action` accepts:

- original selected text
- generated result text
- executed action + optional voice command
- browser page context from the local Playwright action agent

and returns a concise executable browser plan (`steps[]`) for the companion to run locally.

Rate-limit/quota hardening:

- `429` responses include `retryAfterSec` for retry UX
- backend surfaces clear quota/rate messages to companion

## Local Run

```powershell
cd backend/gemini-agent
copy .env.example .env
# Set GOOGLE_API_KEY in your env or shell
npm install
npm start
```

Default port: `8080`

Optional env vars:

- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `GEMINI_LIVE_MODEL` (default: `gemini-live-2.5-flash-preview`)
- `GEMINI_ROUTER_MODEL` (intent router model override)
- `GEMINI_OPTIONS_MODEL` (dynamic options model override)
- `CURSIVIS_ENABLE_LIVE_GROUNDING` (`true`/`false`, default `true`)

## Tests

```powershell
cd backend/gemini-agent
npm test
```

## Docker / Cloud Run

Build from repository root:

```powershell
docker build -f backend/gemini-agent/Dockerfile -t cursivis-gemini-agent .
```

Cloud Run guide: [docs/DEPLOYMENT_GCLOUD.md](../../docs/DEPLOYMENT_GCLOUD.md)
