#!/bin/bash
# Build script for Tauri that temporarily disables API routes

echo "🔧 Preparing Tauri build..."

# Rename api folder to _api (disable it)
if [ -d "src/app/api" ]; then
  echo "📦 Temporarily disabling API routes..."
  mv src/app/api src/app/_api
fi

# Build Next.js with Tauri mode
echo "🏗️  Building Next.js static export..."
TAURI=true npm run build

# Build status
BUILD_STATUS=$?

# Restore api folder
if [ -d "src/app/_api" ]; then
  echo "♻️  Restoring API routes..."
  mv src/app/_api src/app/api
fi

if [ $BUILD_STATUS -ne 0 ]; then
  echo "❌ Build failed!"
  exit $BUILD_STATUS
fi

echo "✅ Build complete! Static files in 'out' directory"
