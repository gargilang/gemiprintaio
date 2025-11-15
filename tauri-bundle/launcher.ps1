# GemiPrint Desktop App Launcher
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$NodeDir = Join-Path $ScriptDir "node\node-v20.18.1-win-x64"
$ServerDir = Join-Path $ScriptDir "server\standalone"
$NodeExe = Join-Path $NodeDir "node.exe"
$ServerJs = Join-Path $ServerDir "server.js"

# Check if server is already running
$serverProcess = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$NodeDir*" }

if (-not $serverProcess) {
    Write-Host "Starting Next.js server..."
    Start-Process -FilePath $NodeExe -ArgumentList $ServerJs -WindowStyle Hidden
    Start-Sleep -Seconds 3
} else {
    Write-Host "Server is already running"
}

# Launch Tauri app
Write-Host "Launching GemiPrint..."
$TauriExe = Join-Path (Split-Path $ScriptDir) "gemiprint.exe"
Start-Process -FilePath $TauriExe
