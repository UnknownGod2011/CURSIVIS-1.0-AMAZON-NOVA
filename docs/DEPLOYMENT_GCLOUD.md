# Nova Agent Deployment (AWS)

This deploys `backend/nova-agent` as a production service for Cursivis.

## Prerequisites

- AWS account with Bedrock access enabled
- `aws` CLI installed and authenticated
- AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)

## Build + Deploy

Run these from repository root:

```powershell
aws config set project YOUR_PROJECT_ID
aws services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

aws builds submit --tag gcr.io/YOUR_PROJECT_ID/cursivis-nova-agent -f backend/nova-agent/Dockerfile .

aws run deploy cursivis-nova-agent `
  --image gcr.io/YOUR_PROJECT_ID/cursivis-nova-agent `
  --region us-central1 `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars AWS_ACCESS_KEY_ID=YOUR_KEY,AWS_SECRET_ACCESS_KEY=YOUR_SECRET,AWS_REGION=us-east-1
```

## Health Check

```powershell
curl https://YOUR_CLOUD_RUN_URL/health
```

Expected:

```json
{"ok":true,"service":"nova-agent","ts":"..."}
```

## Recommended Production Settings

- Turn on Cloud Run min instances (`--min-instances=1`) for lower cold start latency.
- Configure a request timeout of at least 30s for image workflows.
- Monitor `429` responses; when quotas are hit, backend returns `retryAfterSec`.
- Store `GOOGLE_API_KEY` in Secret Manager and inject at deploy time (preferred).
