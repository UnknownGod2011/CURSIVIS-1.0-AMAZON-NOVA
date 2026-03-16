param(
    [switch]$WithBridge,
    [string]$AwsAccessKeyId,
    [string]$AwsSecretAccessKey,
    [string]$AwsRegion = "us-east-1",
    [string]$NovaLiteModel = "us.amazon.nova-2-lite-v1:0",
    [string]$NovaSonicModel = "amazon.nova-2-sonic-v1:0",
    [string]$BackendUrl = "http://127.0.0.1:8080",
    [switch]$EnableStreamingTranscription,
    [switch]$EnableAutoReplace,
    [double]$AutoReplaceConfidence = 0.90,
    [switch]$EnableManagedBrowserFallback,
    [switch]$WarmManagedBrowser,
    [switch]$SkipNpmInstall,
    [switch]$SkipCleanup,
    [switch]$NoHealthCheck,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Usage:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\run-demo.ps1 [-WithBridge] [-AwsAccessKeyId <KEY>] [-AwsSecretAccessKey <SECRET>] [-AwsRegion us-east-1] [-BackendUrl <URL>] [-EnableStreamingTranscription] [-EnableAutoReplace]"
    return
}

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend\nova-agent"
$browserAgentDir = Join-Path $root "desktop\browser-action-agent"
$extensionBridgeDir = Join-Path $root "desktop\browser-native-host"
$companionProject = Join-Path $root "desktop\cursivis-companion\src\Cursivis.Companion\Cursivis.Companion.csproj"
$bridgeProject = Join-Path $root "plugin\logitech-plugin\src\Cursivis.Logitech.Bridge\Cursivis.Logitech.Bridge.csproj"

Write-Host "Starting Cursivis Nova demo stack..."
Write-Host "Backend: $backendDir"
Write-Host "Browser action agent: $browserAgentDir"
Write-Host "Companion project: $companionProject"

if (-not $SkipCleanup) {
    try {
        Write-Host "Running pre-launch cleanup..."
        & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-demo.ps1") | Out-Host
    } catch {
        Write-Warning "Cleanup step failed: $($_.Exception.Message)"
    }
}

# Resolve AWS credentials (param > env)
$resolvedKeyId     = if ($AwsAccessKeyId)     { $AwsAccessKeyId }     else { $env:AWS_ACCESS_KEY_ID }
$resolvedSecret    = if ($AwsSecretAccessKey) { $AwsSecretAccessKey } else { $env:AWS_SECRET_ACCESS_KEY }
$resolvedRegion    = if ($AwsRegion)          { $AwsRegion }          else { $env:AWS_REGION ?? "us-east-1" }

if (-not $resolvedKeyId -or -not $resolvedSecret) {
    Write-Warning "AWS credentials not set. Set -AwsAccessKeyId / -AwsSecretAccessKey or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars. Nova calls will fail without them."
}

$keyIdEscaped     = ($resolvedKeyId     ?? "").Replace("'", "''")
$secretEscaped    = ($resolvedSecret    ?? "").Replace("'", "''")
$regionEscaped    = $resolvedRegion.Replace("'", "''")
$liteModelEscaped = $NovaLiteModel.Replace("'", "''")
$sonicModelEscaped = $NovaSonicModel.Replace("'", "''")

$backendCmdParts = @(
    "`$env:AWS_ACCESS_KEY_ID='$keyIdEscaped'",
    "`$env:AWS_SECRET_ACCESS_KEY='$secretEscaped'",
    "`$env:AWS_REGION='$regionEscaped'",
    "`$env:NOVA_LITE_MODEL='$liteModelEscaped'",
    "`$env:NOVA_SONIC_MODEL='$sonicModelEscaped'",
    "Set-Location -LiteralPath '$backendDir'"
)

if (-not $SkipNpmInstall) { $backendCmdParts += "npm install" }
$backendCmdParts += "npm start"
$backendCmd = $backendCmdParts -join "; "
$backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -PassThru

$browserAgentCmdParts = @(
    "`$env:CURSIVIS_BROWSER_CHANNEL='chrome'",
    "Set-Location -LiteralPath '$browserAgentDir'"
)
if (-not $SkipNpmInstall) { $browserAgentCmdParts += "npm install" }
$browserAgentCmdParts += "npm start"
$browserAgentCmd = $browserAgentCmdParts -join "; "
$browserAgentProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $browserAgentCmd -PassThru

$extensionBridgeCmd = "Set-Location -LiteralPath '$extensionBridgeDir'; .\launch.cmd"
$extensionBridgeProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $extensionBridgeCmd -PassThru

Start-Sleep -Seconds 2

$streamingValue = if ($EnableStreamingTranscription) { "true" } else { "false" }
$autoReplaceConfidenceInvariant = $AutoReplaceConfidence.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$managedBrowserFallbackValue = if ($EnableManagedBrowserFallback) { "true" } else { "false" }

$companionCmdParts = @(
    "`$env:CURSIVIS_BACKEND_URL='$($BackendUrl.Replace("'", "''"))'",
    "`$env:CURSIVIS_ENABLE_STREAMING_TRANSCRIPTION='$streamingValue'",
    "`$env:CURSIVIS_ENABLE_MANAGED_BROWSER_FALLBACK='$managedBrowserFallbackValue'"
)

if ($EnableAutoReplace) {
    $companionCmdParts += "`$env:CURSIVIS_ENABLE_AUTO_REPLACE='true'"
    $companionCmdParts += "`$env:CURSIVIS_AUTO_REPLACE_CONFIDENCE='$autoReplaceConfidenceInvariant'"
}

$companionCmdParts += "dotnet run --project '$companionProject'"
$companionCmd = $companionCmdParts -join "; "
$companionProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", $companionCmd -PassThru

if ($WithBridge) {
    Start-Sleep -Seconds 1
    $bridgeProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "dotnet run --project '$bridgeProject'" -PassThru
    Write-Host "Bridge PID: $($bridgeProcess.Id)"
}

if (-not $NoHealthCheck) {
    $healthOk = $false
    $deadline = (Get-Date).AddSeconds(40)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8080/health" -TimeoutSec 4
            if ($health.StatusCode -eq 200) { $healthOk = $true; Write-Host "Backend health: OK"; break }
        } catch { Start-Sleep -Milliseconds 700 }
    }
    if (-not $healthOk) { Write-Warning "Backend health check did not return 200 yet. Check backend terminal output." }

    $browserHealthOk = $false
    $browserDeadline = (Get-Date).AddSeconds(25)
    while ((Get-Date) -lt $browserDeadline) {
        try {
            $browserHealth = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48820/health" -TimeoutSec 4
            if ($browserHealth.StatusCode -eq 200) { $browserHealthOk = $true; Write-Host "Browser action agent health: OK"; break }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $browserHealthOk) { Write-Warning "Browser action agent health check did not return 200 yet." }
    elseif ($WarmManagedBrowser -and $EnableManagedBrowserFallback) {
        try {
            Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48820/ensure-browser" -Method Post -ContentType "application/json" -Body "{}" -TimeoutSec 12 | Out-Null
            Write-Host "Managed action browser session: ready"
        } catch { Write-Warning "Could not warm the managed action browser session yet." }
    }

    $extensionBridgeHealthOk = $false
    $extensionBridgeDeadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $extensionBridgeDeadline) {
        try {
            $extensionBridgeHealth = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:48830/health" -TimeoutSec 4
            if ($extensionBridgeHealth.StatusCode -eq 200) { $extensionBridgeHealthOk = $true; Write-Host "Extension bridge host health: OK"; break }
        } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $extensionBridgeHealthOk) { Write-Warning "Extension bridge host health check did not return 200 yet." }
}

if ($resolvedKeyId) {
    Write-Host "Launched with AWS credentials injected into backend process."
} else {
    Write-Host "Launched. Make sure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set for the backend terminal."
}
Write-Host "Backend PID: $($backendProcess.Id)"
Write-Host "Browser action agent PID: $($browserAgentProcess.Id)"
Write-Host "Extension bridge host PID: $($extensionBridgeProcess.Id)"
Write-Host "Companion PID: $($companionProcess.Id)"
Write-Host "Tip: close the spawned PowerShell windows to stop each component."
