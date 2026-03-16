# Gemini Agent Deployment (Google Cloud Run)

This deploys `backend/gemini-agent` as a production service for Cursivis.

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- Gemini API key (`GOOGLE_API_KEY`)

## Build + Deploy

Run these from repository root:

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cursivis-gemini-agent -f backend/gemini-agent/Dockerfile .

gcloud run deploy cursivis-gemini-agent `
  --image gcr.io/YOUR_PROJECT_ID/cursivis-gemini-agent `
  --region us-central1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars GOOGLE_API_KEY=YOUR_KEY,CURSIVIS_ENABLE_LIVE_GROUNDING=true,GEMINI_MODEL=gemini-2.5-flash
```

## Health Check

```powershell
curl https://YOUR_CLOUD_RUN_URL/health
```

Expected:

```json
{"ok":true,"service":"gemini-agent","ts":"..."}
```

## Recommended Production Settings

- Turn on Cloud Run min instances (`--min-instances=1`) for lower cold start latency.
- Configure a request timeout of at least 30s for image workflows.
- Monitor `429` responses; when quotas are hit, backend returns `retryAfterSec`.
- Store `GOOGLE_API_KEY` in Secret Manager and inject at deploy time (preferred).
