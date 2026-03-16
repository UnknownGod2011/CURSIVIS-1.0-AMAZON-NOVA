# Cursivis Browser Action Agent

Local Playwright-powered browser executor used by the companion's `Take Action` flow.

## Purpose

- Maintain a managed browser session for browser-first agent tasks
- Inspect live page context for Gemini planning
- Execute safe structured browser steps returned by the backend

## Endpoints

- `GET /health`
- `POST /ensure-browser`
- `GET /page-context`
- `POST /execute-plan`

## Local Run

```powershell
cd desktop/browser-action-agent
npm install
npm start
```

Default port: `48820`

Optional env vars:

- `CURSIVIS_BROWSER_AGENT_PORT=48820`
- `CURSIVIS_BROWSER_CHANNEL=msedge|chrome`

## Notes

- The agent acts on the managed browser session it launches.
- For highest reliability, perform browser workflows inside that managed Cursivis browser window before pressing `Take Action`.
