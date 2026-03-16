# Cursivis

Windows-first cursor-native AI interaction system powered by Amazon Nova.

Built for the **Amazon Nova AI Hackathon** — using Nova 2 Lite, Nova 2 Sonic, and Nova Act.

This repository is organized for parallel development of:

- Logitech trigger integration (`plugin/logitech-plugin`)
- Windows companion app (`desktop/cursivis-companion`)
- Local browser action executor (`desktop/browser-action-agent`)
- Nova agent backend (`backend/nova-agent`)
- Shared cross-component contracts (`shared/ipc-protocol`)

## Amazon Nova Models

| Model | Usage |
|---|---|
| Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) | Text/image analysis, intent routing, browser action planning |
| Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) | Real-time voice via bidirectional streaming |
| Nova Act | UI workflow automation (browser action execution layer) |

## Quick Start

### Prerequisites

- Windows 10 or 11, .NET 8 SDK, Node.js 20+
- AWS account with Bedrock access (Nova 2 Lite + Nova 2 Sonic enabled)
- AWS credentials: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### Get AWS Credentials

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/) and create a user with `AmazonBedrockFullAccess`
2. Generate an Access Key
3. Go to [Bedrock Console](https://console.aws.amazon.com/bedrock/) and enable Nova 2 Lite + Nova 2 Sonic under Model access

### Start The Full Local Demo

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 `
  -AwsAccessKeyId "<YOUR_AWS_ACCESS_KEY_ID>" `
  -AwsSecretAccessKey "<YOUR_AWS_SECRET_ACCESS_KEY>" `
  -WithBridge -EnableStreamingTranscription
```

### Smoke Test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1 `
  -AwsAccessKeyId "<YOUR_AWS_ACCESS_KEY_ID>" `
  -AwsSecretAccessKey "<YOUR_AWS_SECRET_ACCESS_KEY>"
```

### Stop All Components

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-demo.ps1
```

## AWS Deployment

- Deployment guide: [docs/DEPLOYMENT_AWS.md](docs/DEPLOYMENT_AWS.md)
- Automated deploy script: [scripts/deploy-aws.ps1](scripts/deploy-aws.ps1)
- Container source: [backend/nova-agent/Dockerfile](backend/nova-agent/Dockerfile)

## Architecture

- [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md)
- [docs/ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md)
- [docs/HACKATHON_BUILD_POST.md](docs/HACKATHON_BUILD_POST.md)
