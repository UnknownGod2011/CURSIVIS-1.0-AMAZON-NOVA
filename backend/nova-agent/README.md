# Cursivis Nova Agent

Amazon Nova-powered backend for Cursivis. Powered by:

- **Nova 2 Lite** — text/multimodal analysis via Bedrock Converse API
- **Nova 2 Sonic** — real-time voice via Bedrock bidirectional streaming
- **Nova Act** — UI automation (Python SDK, separate service)

## Prerequisites

- Node.js 20+
- AWS account with Bedrock access
- Nova 2 Lite and Nova 2 Sonic models enabled in your AWS region

## AWS Credentials Setup

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Create a user or role with the `AmazonBedrockFullAccess` policy (or a scoped policy allowing `bedrock:InvokeModel` and `bedrock:InvokeModelWithBidirectionalStream`)
3. Generate an Access Key and Secret Access Key

## Enable Nova Models in Bedrock

1. Go to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/) → Model access
2. Request access to **Amazon Nova 2 Lite** and **Amazon Nova 2 Sonic**
3. Wait for approval (usually instant)

## Nova Act API Key

1. Visit [https://nova.amazon.com/act](https://nova.amazon.com/act)
2. Sign in with your AWS account
3. Generate an API key from the dashboard

## Setup

```bash
cp .env.example .env
# Fill in your credentials in .env
npm install
node src/server.js
```

## Environment Variables

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_REGION` | AWS region (default: `us-east-1`) |
| `NOVA_LITE_MODEL` | Nova 2 Lite model ID (default: `us.amazon.nova-2-lite-v1:0`) |
| `NOVA_SONIC_MODEL` | Nova 2 Sonic model ID (default: `amazon.nova-2-sonic-v1:0`) |
| `NOVA_ACT_API_KEY` | Nova Act API key |
| `PORT` | HTTP port (default: `8080`) |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/analyze` | Analyze selected text/image |
| POST | `/suggest-actions` | Get action suggestions |
| POST | `/transcribe` | Transcribe audio |
| POST | `/plan-browser-action` | Plan browser automation steps |
| WS | `/live` | Nova 2 Sonic voice stream |

## Docker

```bash
# From the cursivis/ root
docker build -f backend/nova-agent/Dockerfile -t cursivis-nova-agent .
docker run -p 8080:8080 --env-file backend/nova-agent/.env cursivis-nova-agent
```
