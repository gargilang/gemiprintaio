#!/usr/bin/env bash
# Build script untuk gemiprint Tauri App

set -e

echo "🚀 Building gemiprint Tauri App..."
echo ""

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Rust is not installed!"
    echo "Please install Rust from https://rustup.rs/"
    exit 1
fi

# Check if Node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Rust version: $(rustc --version)"
echo "✅ Node version: $(node --version)"
echo "✅ npm version: $(npm --version)"
echo ""

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
    echo ""
fi

# Build Next.js static export
echo "🔨 Building Next.js static export..."
export TAURI=true
npm run build
echo ""

# Build Tauri app
echo "🔨 Building Tauri application..."
npm run tauri build
echo ""

echo "✅ Build complete!"
echo ""
echo "📦 Build outputs are in: src-tauri/target/release/bundle/"
echo ""
