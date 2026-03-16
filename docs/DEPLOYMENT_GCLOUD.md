# Gemini Agent Deployment (Google Cloud Run)

This deploys only `backend/gemini-agent` as a production-ready service for Cursivis.

## Important: Will This Affect The Current Local Demo?

No. Deploying the backend to Google Cloud Run does not change the current working local version unless you explicitly point the companion at the cloud URL.

Current default behavior:

- local backend stays on `http://127.0.0.1:8080`
- local companion keeps using the local backend by default
- cloud deployment is isolated until you opt into it with `-BackendUrl`

That means you can keep your current demo setup exactly as it is and deploy Cloud Run only for the hackathon submission requirement.

## Google Cloud Services Used

- Cloud Run
- Cloud Build
- Artifact Registry / Container Registry path via `gcloud builds submit`
- Secret Manager (recommended)

## Prerequisites

- Google Cloud project with billing enabled
- `gcloud` CLI installed and authenticated
- Gemini API key (`GOOGLE_API_KEY`)

## Fastest Path: Automated Deployment Script

Run this from the repository root:

```powershell
Set-Location -LiteralPath "C:\Users\Admin\OneDrive\Desktop\Cursivis! - Copy\cursivis"

powershell -ExecutionPolicy Bypass -File .\scripts\deploy-cloudrun.ps1 `
  -ProjectId "YOUR_PROJECT_ID" `
  -Region "us-central1" `
  -GoogleApiKey "YOUR_GOOGLE_API_KEY" `
  -UseSecretManager
```

Deployment script:

- [scripts/deploy-cloudrun.ps1](../scripts/deploy-cloudrun.ps1)

What it does:

- enables required Google Cloud services
- optionally creates or updates a Secret Manager secret
- builds the backend container with Cloud Build
- deploys the service to Cloud Run
- prints the Cloud Run service URL and health endpoint

## Manual Build + Deploy

If you prefer the manual path, run these from the repository root:

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cursivis-gemini-agent -f backend/gemini-agent/Dockerfile .

gcloud run deploy cursivis-gemini-agent `
  --image gcr.io/YOUR_PROJECT_ID/cursivis-gemini-agent `
  --region us-central1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars GOOGLE_API_KEY=YOUR_KEY,CURSIVIS_ENABLE_LIVE_GROUNDING=true,GEMINI_MODEL=gemini-2.5-flash
```

Container source:

- [backend/gemini-agent/Dockerfile](../backend/gemini-agent/Dockerfile)

## Health Check

```powershell
curl https://YOUR_CLOUD_RUN_URL/health
```

Expected:

```json
{"ok":true,"service":"gemini-agent","ts":"..."}
```

## Test The Cloud Backend Without Disturbing The Local Version

Once deployed, you can point only the companion at the cloud service for proof or judge testing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 `
  -ApiKey "<LOCAL_OR_FALLBACK_KEY>" `
  -BackendUrl "https://YOUR_CLOUD_RUN_URL"
```

This does not overwrite defaults. If you restart `run-demo.ps1` without `-BackendUrl`, it goes back to the normal local backend.

You can also smoke-test the cloud backend directly:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 `
  -ApiKey "<YOUR_GOOGLE_API_KEY>" `
  -BackendUrl "https://YOUR_CLOUD_RUN_URL"
```

## Judge-Friendly Proof Of Deployment

For the hackathon submission, you can use any of these as proof:

1. A short screen recording showing:
   - the Cloud Run service page
   - the deployed URL
   - the `/health` endpoint returning success
2. A code link to:
   - [scripts/deploy-cloudrun.ps1](../scripts/deploy-cloudrun.ps1)
   - [backend/gemini-agent/Dockerfile](../backend/gemini-agent/Dockerfile)
   - this deployment guide

## Recommended Production Settings

- Use Secret Manager for `GOOGLE_API_KEY`
- Turn on Cloud Run min instances (`--min-instances=1`) for lower cold-start latency
- Use at least a 30 second timeout for image and browser-planning workflows
- Monitor `429` responses; the backend returns retry timing hints when quotas are hit
