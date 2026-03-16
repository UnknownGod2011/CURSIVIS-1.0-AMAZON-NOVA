# Nova Agent Deployment (AWS)

This deploys `backend/nova-agent` as a production service for Cursivis.

## Important: Will This Affect The Current Local Demo?

No. Deploying the backend to AWS does not change the current working local version unless you explicitly point the companion at the cloud URL.

Current default behavior:
- local backend stays on `http://127.0.0.1:8080`
- local companion keeps using the local backend by default
- cloud deployment is isolated until you opt into it with `-BackendUrl`

## AWS Services Used

- Amazon ECR (container registry)
- AWS App Runner or ECS Fargate (container hosting)
- Amazon Bedrock (Nova 2 Lite + Nova 2 Sonic models)
- AWS Secrets Manager (recommended for credentials)

## Prerequisites

- AWS account with Bedrock access enabled
- Nova 2 Lite and Nova 2 Sonic models enabled in your region (Bedrock → Model access)
- AWS CLI installed and authenticated
- Docker installed
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` with `AmazonBedrockFullAccess` + ECR permissions

## Fastest Path: Automated Deployment Script

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-aws.ps1 `
  -AwsAccountId "123456789012" `
  -AwsAccessKeyId "AKIA..." `
  -AwsSecretAccessKey "your-secret" `
  -Region "eu-north-1"
```

This will:
1. Create an ECR repository
2. Build and push the Docker image
3. Print the App Runner deploy command to run next

## Manual Steps

### 1. Build and push image

```powershell
# From repo root
$ACCOUNT = "123456789012"
$REGION  = "eu-north-1"
$IMAGE   = "cursivis-nova-agent"

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker build -f backend/nova-agent/Dockerfile -t ${IMAGE}:latest .
docker tag ${IMAGE}:latest "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/${IMAGE}:latest"
docker push "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/${IMAGE}:latest"
```

### 2. Deploy to App Runner (simplest)

```powershell
aws apprunner create-service `
  --service-name cursivis-nova-agent `
  --region $REGION `
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "<ECR_IMAGE_URI>:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "8080",
        "RuntimeEnvironmentVariables": {
          "AWS_ACCESS_KEY_ID": "<KEY>",
          "AWS_SECRET_ACCESS_KEY": "<SECRET>",
          "AWS_REGION": "eu-north-1",
          "BEDROCK_TEXT_MODEL_ID": "amazon.nova-lite-v1:0",
          "BEDROCK_VOICE_MODEL_ID": "amazon.nova-2-sonic-v1:0"
        }
      }
    }
  }'
```

## Health Check

```powershell
curl https://YOUR_APP_RUNNER_URL/health
```

Expected:

```json
{"ok":true,"service":"nova-agent","ts":"..."}
```

## Recommended Production Settings

- Set `--min-size 1` on App Runner for lower cold start latency.
- Configure a request timeout of at least 30s for image workflows.
- Monitor `429` responses — when Bedrock throttles, backend returns `retryAfterSec`.
- Store credentials in AWS Secrets Manager and inject at deploy time (preferred over env vars).

## Using the Cloud Backend Locally

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 `
  -AwsAccessKeyId "<KEY>" `
  -AwsSecretAccessKey "<SECRET>" `
  -BackendUrl "https://YOUR_APP_RUNNER_URL"
```
