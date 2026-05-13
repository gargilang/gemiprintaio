# gemiprint

A full-featured business management application for printing companies — covering POS (Point of Sale), material inventory, customer & vendor management, production & finishing, purchasing, accounts payable/receivable, cashbook (income/expenses), and reporting with PDF export.

Available on two platforms:

| Platform | Stack | Storage |
|----------|-------|---------|
| **Web** | Next.js on Vercel | Supabase (cloud Postgres) |
| **Desktop** | Tauri + Next.js standalone | Local SQLite + sync to Supabase |

## About This Project

This repository was built entirely using AI coding agents — [GitHub Copilot](https://github.com/features/copilot) in the early stages and [Cursor](https://www.cursor.com/) in the later stages. I am not a programmer. I conceived, directed, and managed the entire product, using modern AI-assisted development tools to turn my vision into a fully working, production-grade application. This project serves as a demonstration of what is possible when domain expertise meets the right tools — no traditional coding background required.

## Download Desktop App

> **Windows (64-bit):** [gemiprint_0.1.0_x64_en-US.msi](https://github.com/gargilang/gemiprintaio/releases/latest)

Visit the [Releases](https://github.com/gargilang/gemiprintaio/releases) page for all versions.

The desktop app automatically notifies users when a new version is available.

## Development Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Rust](https://rustup.rs/) (for desktop builds)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for database migrations)
- [GitHub CLI](https://cli.github.com/) (for publishing releases)

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local   # then fill in the values
```

### Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...
SESSION_SECRET=random-string-32-chars-min
```

### Updater Signing Key (developer only)

The desktop auto-updater requires a private signing key to sign new releases. This key is **not** stored in the repository — it must be manually placed on every developer machine.

**On a new computer, before you can run `npm run release:desktop`:**

1. Download `gemiprint.key` from the private Google Drive folder:
   https://drive.google.com/drive/folders/11N6siiUWBKXrQDNRHZgWpn8A-HA9gH74?usp=drive_link
2. Place it at: `%APPDATA%\.tauri\gemiprint.key`
   (Full path example: `C:\Users\<you>\AppData\Roaming\.tauri\gemiprint.key`)
3. Verify the file exists, then you are ready to build and release.

> **Note:** This Google Drive folder is access-restricted to the project owner only.

## Development

```bash
# Web app only (port 3000)
npm run dev

# Desktop app only (port 3001 + Tauri window)
npm run tauri:dev

# Both simultaneously
npm run dev:all
```

## Build

### Web (Vercel)

Push to `main` — Vercel deploys automatically.

### Desktop (Windows Installer)

```bash
npm run tauri:build
```

Output:
- `src-tauri/target/release/bundle/msi/gemiprint_x.x.x_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/gemiprint_x.x.x_x64-setup.exe`

## Releasing a Desktop Update

```bash
# 1. Bump the version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml
# 2. Build
npm run tauri:build
# 3. Sign, upload to GitHub Releases, and update the manifest
npm run release:desktop
```

The `release:desktop` script automatically:
1. Signs the installer with the private key
2. Creates a GitHub Release and uploads the installer
3. Updates `updates/latest.json` and pushes to `main`

Desktop users will receive an automatic update notification.

## Project Structure

```
gemiprintaio/
├── src/                    # Next.js frontend + API routes
│   ├── app/                # App router (pages & API)
│   │   ├── api/            # REST API endpoints
│   │   ├── auth/           # Login page
│   │   ├── dashboard/      # Main dashboard
│   │   ├── pos/            # Point of Sale
│   │   ├── materials/      # Material & product management
│   │   ├── customers/      # Customer management
│   │   ├── vendors/        # Vendor management
│   │   ├── purchases/      # Purchasing
│   │   ├── production/     # Production & finishing
│   │   ├── finance/        # Cashbook (income/expenses)
│   │   ├── reports/        # Reports & PDF export
│   │   ├── settings/       # App settings
│   │   └── users/          # User management
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utilities, services, database layer
├── src-tauri/              # Tauri desktop app (Rust)
│   ├── src/main.rs         # Entry point, server lifecycle, sync
│   ├── src/sync.rs         # Offline-first sync engine
│   └── tauri.conf.json     # Tauri configuration
├── database/               # SQLite template database
├── supabase/               # Supabase migrations
├── scripts/                # Build & release scripts
├── updates/                # Auto-updater manifest
└── tauri-bundle/           # Bundled resources for desktop installer
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Desktop:** Tauri 2, Rust
- **Database:** SQLite (desktop, via better-sqlite3), Supabase Postgres (web + cloud sync)
- **Auth:** JWT sessions with bcrypt password hashing
- **PDF:** jsPDF + jspdf-autotable for report printing
- **AI Tools Used:** GitHub Copilot, Cursor
