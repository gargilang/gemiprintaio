@echo off
REM Build script untuk GemiPrint Tauri App (Windows)

echo.
echo Building GemiPrint Tauri App...
echo.

REM Check if Rust is installed
where cargo >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Rust is not installed!
    echo Please install Rust from https://rustup.rs/
    exit /b 1
)

REM Check if Node is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

echo Rust version:
cargo --version
echo.
echo Node version:
node --version
echo.
echo npm version:
npm --version
echo.

REM Install npm dependencies if needed
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
    echo.
)

REM Build Next.js static export
echo Building Next.js static export...
set TAURI=true
call npm run build
echo.

REM Build Tauri app
echo Building Tauri application...
call npm run tauri build
echo.

echo Build complete!
echo.
echo Build outputs are in: src-tauri\target\release\bundle\
echo.
pause
