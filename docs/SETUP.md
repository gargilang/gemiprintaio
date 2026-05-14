# Developer Setup Guide

This guide helps you (or your AI agent) set up a fresh development machine for gemiprint. It covers both **Windows** and **macOS**, and is ordered from easiest to hardest.

> **Tip for AI agents:** Run the commands in each section sequentially. If a step fails, report it to the user — they may need to install that dependency manually.

---

## Quick Overview

| Dependency | Required For | Install Method |
|-----------|-------------|----------------|
| Git | Everything | CLI / manual |
| Node.js v22+ | Web app, Tauri | CLI / manual |
| Rust + Cargo | Tauri desktop app | CLI |
| Flutter SDK | Mobile + mobile web | CLI / manual |
| Android Studio | Flutter Android builds | Manual |
| Supabase CLI | Database migrations | CLI |
| GitHub CLI | Releases, PR management | CLI |

---

## Step 1: Git

Git is likely already installed. Verify:

```bash
git --version
```

**If not installed:**

- **Windows:** Download from https://git-scm.com/download/win
- **macOS:** Install via Xcode command line tools:
  ```bash
  xcode-select --install
  ```

---

## Step 2: Node.js (v22+)

```bash
node --version
```

**If not installed or version < 22:**

- **Windows & macOS:** Download the LTS installer from https://nodejs.org/
- **Alternative (both OS):** Use [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows):
  ```bash
  # macOS/Linux
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  nvm install 22
  nvm use 22

  # Windows (after installing nvm-windows)
  nvm install 22
  nvm use 22
  ```

---

## Step 3: Rust + Cargo (for desktop app only)

```bash
rustc --version
cargo --version
```

**If not installed:**

Works the same on both Windows and macOS:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

On **Windows**, if `curl` doesn't work in your shell, download and run the installer from https://rustup.rs/

After installation, restart your terminal and verify with `rustc --version`.

---

## Step 4: Flutter SDK (for mobile app)

```bash
flutter --version
```

**If not installed:**

- **Windows:**
  ```bash
  # Option A: Using Chocolatey (if installed)
  choco install flutter

  # Option B: Manual
  # Download from https://docs.flutter.dev/get-started/install/windows
  # Extract to C:\flutter
  # Add C:\flutter\bin to your PATH
  ```

- **macOS:**
  ```bash
  # Option A: Using Homebrew
  brew install --cask flutter

  # Option B: Manual
  # Download from https://docs.flutter.dev/get-started/install/macos
  # Extract to ~/flutter
  # Add ~/flutter/bin to your PATH
  ```

After installation, run the doctor to check for issues:

```bash
flutter doctor
```

---

## Step 5: Android Studio (for Flutter Android — manual install)

> **This step requires manual installation.** AI agents cannot install Android Studio via CLI.

1. Download from https://developer.android.com/studio
2. Install and launch Android Studio
3. Go to **SDK Manager** → install the latest Android SDK
4. Go to **Virtual Device Manager** → create an Android emulator
5. Accept Android licenses:
   ```bash
   flutter doctor --android-licenses
   ```

Verify:

```bash
flutter doctor
```

All checkmarks should be green for Android.

---

## Step 6: Supabase CLI

```bash
supabase --version
```

**If not installed:**

- **Windows:**
  ```bash
  npm install -g supabase
  ```

- **macOS:**
  ```bash
  brew install supabase/tap/supabase
  ```

---

## Step 7: GitHub CLI

```bash
gh --version
```

**If not installed:**

- **Windows:**
  ```bash
  # Using winget
  winget install --id GitHub.cli

  # Or using Chocolatey
  choco install gh
  ```

- **macOS:**
  ```bash
  brew install gh
  ```

After installing, authenticate:

```bash
gh auth login
```

---

## Step 8: Clone and Install Project Dependencies

```bash
# Clone the repo
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio

# Install Node.js dependencies (web + desktop)
npm install

# Install Flutter dependencies (mobile + mobile web)
cd flutter && flutter pub get && cd ..

# Create environment file
cp .env.example .env.local
# Then fill in the values (ask the project owner for credentials)
```

---

## Step 9: Verify Everything Works

```bash
# Web app
npm run dev
# Open http://localhost:3000

# Desktop app (requires Rust)
npm run tauri:dev

# Flutter mobile (requires Android emulator running)
cd flutter && flutter run

# Flutter mobile pointed at production
cd flutter && flutter run --dart-define=API_BASE_URL=https://app.gemiprint.com
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `flutter doctor` shows issues | Follow the doctor's suggestions for each issue |
| Android emulator won't start | Enable hardware virtualization (VT-x) in BIOS |
| `npm install` fails on Windows | Run terminal as Administrator |
| Rust build fails | Make sure Visual Studio C++ Build Tools are installed (Windows) |
| `SESSION_SECRET is not set` | Fill in `.env.local` with the correct values |

---

## What Each Platform Needs

| If you only need... | Install steps |
|--------------------|---------------|
| Web app development | Steps 1, 2, 8 |
| Desktop app development | Steps 1, 2, 3, 8 |
| Mobile app development | Steps 1, 2, 4, 5, 8 |
| Everything | All steps |
