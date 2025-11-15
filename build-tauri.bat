@echo off
REM Build script for Tauri that temporarily disables API routes

echo Building for Tauri...

REM Rename api folder to _api (disable it)
if exist "src\app\api" (
  echo Temporarily disabling API routes...
  ren "src\app\api" "_api"
)

REM Build Next.js with Tauri mode
echo Building Next.js static export...
set TAURI=true
call npm run build

REM Store build status
set BUILD_STATUS=%ERRORLEVEL%

REM Restore api folder
if exist "src\app\_api" (
  echo Restoring API routes...
  ren "src\app\_api" "api"
)

if %BUILD_STATUS% neq 0 (
  echo Build failed!
  exit /b %BUILD_STATUS%
)

echo Build complete! Static files in 'out' directory
