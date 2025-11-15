@echo off
REM GemiPrint Desktop App Launcher
REM This script starts the Next.js server and then launches the Tauri app

setlocal

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM Set Node.js paths
set NODE_DIR=%SCRIPT_DIR%node\node-v20.18.1-win-x64
set PATH=%NODE_DIR%;%PATH%

REM Set server directory
set SERVER_DIR=%SCRIPT_DIR%server\standalone

REM Check if server is already running
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo Server is already running
) else (
    echo Starting Next.js server...
    start /B "" "%NODE_DIR%\node.exe" "%SERVER_DIR%\server.js"
    
    REM Wait for server to be ready
    timeout /t 3 /nobreak >nul
)

REM Launch Tauri app
echo Launching GemiPrint...
start "" "%SCRIPT_DIR%..\gemiprint.exe"

endlocal
exit
