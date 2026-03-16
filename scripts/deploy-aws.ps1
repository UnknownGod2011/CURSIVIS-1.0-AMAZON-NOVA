param(
    [Parameter(Mandatory = $true)]
    [string]$AwsAccountId,
    [string]$Region = "eu-north-1",
    [string]$ServiceName = "cursivis-nova-agent",
    [string]$ImageName = "cursivis-nova-agent",
    [Parameter(Mandatory = $true)]
    [string]$AwsAccessKeyId,
    [Parameter(Mandatory = $true)]
    [string]$AwsSecretAccessKey,
    [string]$NovaLiteModel = "amazon.nova-lite-v1:0",
    [string]$NovaSonicModel = "amazon.nova-2-sonic-v1:0",
    [int]$Port = 8080,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\deploy-aws.ps1 -AwsAccountId <ID> -AwsAccessKeyId <KEY> -AwsSecretAccessKey <SECRET> [-Region eu-north-1] [-ServiceName cursivis-nova-agent]"
    return
}

function Invoke-Aws {
    param([string[]]$Arguments)
    Write-Host "aws $($Arguments -join ' ')"
    & aws @Arguments
    if ($LASTEXITCODE -ne 0) { throw "aws command failed." }
}

$root = Split-Path -Parent $PSScriptRoot
$ecrUri = "$AwsAccountId.dkr.ecr.$Region.amazonaws.com/$ImageName"

Write-Host "Deploying Cursivis Nova Agent to AWS..."
Write-Host "Account: $AwsAccountId"
Write-Host "Region:  $Region"
Write-Host "Service: $ServiceName"
Write-Host "Image:   $ecrUri"

# Set credentials for this session
$env:AWS_ACCESS_KEY_ID     = $AwsAccessKeyId
$env:AWS_SECRET_ACCESS_KEY = $AwsSecretAccessKey
$env:AWS_REGION            = $Region

# Create ECR repo if it doesn't exist
try {
    Invoke-Aws -Arguments @("ecr", "describe-repositories", "--repository-names", $ImageName, "--region", $Region) | Out-Null
} catch {
    Invoke-Aws -Arguments @("ecr", "create-repository", "--repository-name", $ImageName, "--region", $Region)
}

# Authenticate Docker to ECR
$loginPassword = (& aws ecr get-login-password --region $Region)
$loginPassword | docker login --username AWS --password-stdin "$AwsAccountId.dkr.ecr.$Region.amazonaws.com"

# Build and push Docker image
Push-Location $root
try {
    docker build -f "backend/nova-agent/Dockerfile" -t "${ImageName}:latest" .
    docker tag "${ImageName}:latest" "${ecrUri}:latest"
    docker push "${ecrUri}:latest"
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Image pushed: ${ecrUri}:latest"
Write-Host ""
Write-Host "Next steps — deploy to App Runner (simplest option):"
Write-Host ""
Write-Host "  aws apprunner create-service --service-name $ServiceName --region $Region --source-configuration '{""ImageRepository"":{""ImageIdentifier"":""${ecrUri}:latest"",""ImageRepositoryType"":""ECR"",""ImageConfiguration"":{""Port"":""$Port"",""RuntimeEnvironmentVariables"":{""AWS_ACCESS_KEY_ID"":""$AwsAccessKeyId"",""AWS_SECRET_ACCESS_KEY"":""$AwsSecretAccessKey"",""AWS_REGION"":""$Region"",""BEDROCK_TEXT_MODEL_ID"":""$NovaLiteModel"",""BEDROCK_VOICE_MODEL_ID"":""$NovaSonicModel""}}}}'"
Write-Host ""
Write-Host "Or deploy to ECS Fargate using the task definition in infra/ecs-task-definition.json"
Write-Host ""
Write-Host "Health check after deploy: https://<APP_RUNNER_URL>/health"
