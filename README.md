# gemiprint

A full-featured business management application for printing companies — covering POS (Point of Sale), roll & sheet inventory with moving-average costing, customer & vendor management, production work orders (SPK) & finishing, purchasing with auto-PO/reorder, accounts payable/receivable, a formula-driven cashbook (income/expenses & profit sharing), Indonesian VAT (PPN) handling, quotations, delivery notes, and reporting with PDF export.

The product UI is fully in Bahasa Indonesia (all users are Indonesian); the codebase and docs follow an Indonesia-first naming standard.

Available on four platforms:


| Platform       | Stack                      | Storage                         | URL / Distribution                                                    |
| -------------- | -------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| **Web**        | Next.js on Vercel          | Supabase (cloud Postgres)       | [app.gemiprint.com](https://app.gemiprint.com)                        |
| **Desktop**    | Tauri + Next.js standalone | Local SQLite + sync to Supabase | [GitHub Releases](https://github.com/gargilang/gemiprintaio/releases) |
| **Mobile**     | Flutter (Android)          | Online-only via Next.js API     | Google Play (coming soon)                                             |
| **Mobile Web** | Flutter Web                | Online-only via Next.js API     | [m.gemiprint.com](https://m.gemiprint.com)                            |


## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Supabase (Postgres)                         │
│                    Cloud database + Row Level Security              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
          ┌─────────▼─────────┐ ┌─────────▼──────────┐
          │   Next.js API     │ │   Supabase Direct  │
          │ app.gemiprint.com │ │   (service-role)   │
          │  (Vercel)         │ │                    │
          └──┬──────┬──────┬──┘ └─────────┬──────────┘
             │      │      │              │
     ┌───────▼┐ ┌───▼────┐ ┌──▼──────┐ ┌──▼──────────────┐
     │  Web   │ │Flutter │ │Flutter  │ │  Tauri Desktop  │
     │  App   │ │Android │ │  Web    │ │  (Windows)      │
     │(React) │ │  App   │ │  App    │ │                 │
     └────────┘ └────────┘ └─────────┘ │ Next.js embedded│
                                       │ + SQLite local  │
                                       │ + sync engine   │
                                       └─────────────────┘
```

**How each platform connects:**

- **Web App** — React SPA served by Next.js; API routes on the same server talk to Supabase using the service-role key. Users never touch Supabase directly.
- **Desktop App** — Tauri bundles a standalone Next.js server and a local SQLite database. It works offline-first and syncs to Supabase when connectivity is available.
- **Flutter Mobile & Mobile Web** — Connects exclusively through the Next.js API at `app.gemiprint.com`. This ensures the app works even on networks where `supabase.com` is blocked. Authentication uses JWT Bearer tokens.

## About This Project

This repository was built entirely using AI coding agents — [GitHub Copilot](https://github.com/features/copilot) in the early stages and [Cursor](https://www.cursor.com/) in the later stages. I am not a programmer. I conceived, directed, and managed the entire product, using modern AI-assisted development tools to turn my vision into a fully working, production-grade application. This project serves as a demonstration of what is possible when domain expertise meets the right tools — no traditional coding background required.

## Features

- **POS / Kasir** — sell stocked goods, services (JASA), and subcontract jobs (MAKLON, which auto-generates a linked vendor PO). Roll items are billed by roll-width-aligned dimensions; thermal receipt and A4 faktur (invoice) printing.
- **Inventory ledger** — `inventory_movements` is the single source of truth for stock and moving-average cost (AVCO). Supports purchase receipt, sale issue, void/return, adjustment, waste, and roll conversion (cutting one roll width into several), all idempotent and AVCO-aware.
- **Roll/dimensional materials** — items sold by area (m²) but stocked physically as rolls of fixed width × variable length, tracked per width in `barang_roll_variants`.
- **Purchasing** — purchases with PPN, debt (NET30/COD) vs cash, purchase orders with auto-reorder suggestions, and purchase returns.
- **Production** — work orders (SPK) with item/finishing status tracking and material consumption posting; an AI design-brief prompt generator.
- **Finance** — a formula-driven cashbook with a custom AST expression engine, configurable per-person profit sharing / cash advance / bonus, accounting period close, and CSV import.
- **Indonesian VAT (PPN)** — output/input VAT, NSFP (tax serial number) pool, and a monthly report to cross-check against Coretax DJP.
- **Documents** — quotations (penawaran), delivery notes (surat jalan), and PDF/print exports.
- **Offline-first desktop** — local SQLite with a background sync engine to Supabase.
- **Roles & audit** — admin / manager / production / warehouse / kasir guards on mutations, with a full audit log.

## Download

> **Desktop (Windows 64-bit):** [gemiprint_0.1.0_x64_en-US.msi](https://github.com/gargilang/gemiprintaio/releases/latest)

Visit the [Releases](https://github.com/gargilang/gemiprintaio/releases) page for all versions. The desktop app automatically notifies users when a new version is available.

## Development Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [Rust](https://rustup.rs/) (for desktop builds)
- [Flutter](https://flutter.dev/) 3.x+ (for mobile/mobile-web builds)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for database migrations)
- [GitHub CLI](https://cli.github.com/) (for publishing releases)

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio

# 2. Install web/desktop dependencies
npm install

# 3. Install Flutter dependencies
cd flutter && flutter pub get && cd ..

# 4. Create environment file
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
  [https://drive.google.com/drive/folders/11N6siiUWBKXrQDNRHZgWpn8A-HA9gH74?usp=drive_link](https://drive.google.com/drive/folders/11N6siiUWBKXrQDNRHZgWpn8A-HA9gH74?usp=drive_link)
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

# Flutter mobile (requires a connected device or emulator)
cd flutter && flutter run

# Flutter mobile pointed at production API
cd flutter && flutter run --dart-define=API_BASE_URL=https://app.gemiprint.com

# Flutter web — local dev (opens Microsoft Edge on http://localhost:8080 by default).
# Requires Chrome? No — use `-d edge`. Install Chrome only if you prefer `-d chrome`.
# Device toolbar in Edge: F12 → Toggle device emulation.
npm run dev:flutter-web

# Same from Git Bash / MinGW64 / WSL (repo root):
bash scripts/flutter-web-dev.sh

# Web server only (no auto-open browser); open http://localhost:8080/login in Cursor / Edge yourself.
cd flutter && flutter run -d web-server --web-port=8080

# If a browser shows a blank page (some embedded WebViews), try HTML renderer:
cd flutter && flutter run -d edge --web-port=8080 --web-renderer html

# Optional: local Next.js API (may need CORS if browser blocks cross-origin)
cd flutter && flutter run -d edge --web-port=8080 --dart-define=API_BASE_URL=http://localhost:3000
```

**Flutter web notes:** Routing is **path-based** (bukan `#/login`). Buka `**http://localhost:8080/login`** atau `**http://localhost:8080/`** (akan redirect). URL `/#/login` bisa memunculkan layar putih.

Login ke API production dari `localhost` membutuhkan header **CORS** di server Next.js — sudah ditambahkan di `src/middleware.ts`; deploy ke Vercel supaya `app.gemiprint.com` mengizinkan origin `http://localhost:8080`.

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

### Flutter Mobile (Android APK)

```bash
cd flutter
flutter build apk --release --dart-define=API_BASE_URL=https://app.gemiprint.com
```

Output: `flutter/build/app/outputs/flutter-apk/app-release.apk`

### Flutter Web

```bash
cd flutter
flutter build web --dart-define=API_BASE_URL=https://app.gemiprint.com
```

Output: `flutter/build/web/`

### Mobile Web Deploy (m.gemiprint.com)

Mobile web is a separate Flutter Web static deployment. The production API stays on
`https://app.gemiprint.com`, while `https://m.gemiprint.com` serves only the Flutter
client. The Next.js middleware redirects mobile browsers from `app.gemiprint.com`
to `m.gemiprint.com`; API routes are not redirected.

Recommended Vercel setup:

```bash
cd flutter
flutter build web --dart-define=API_BASE_URL=https://app.gemiprint.com
cd build/web
npx vercel --prod
npx vercel alias set <deployment-url> m.gemiprint.com --scope gemiprint
```

Use a separate Vercel project for this static deployment, for example
`gemiprint-mobile-web`, and attach the domain `m.gemiprint.com` to that project.
The file `flutter/web/vercel.json` is copied into `flutter/build/web/` during
`flutter build web` and rewrites all paths to `index.html`, so path-based Flutter
routes such as `/login`, `/pos`, and `/finance` work after refresh.

Current production setup:

- Vercel team: `gemiprint`
- Vercel project: `gemiprint-mobile-web`
- Production alias: `https://m.gemiprint.com`

Mobile web intentionally contains only backup/emergency features: Dashboard,
POS/Kasir, SPK, Data Barang, Pembelian, Pelanggan, Vendor, and simple Keuangan.
Advanced web/desktop-only features such as Surat Jalan, AI Prompt, Log Audit,
Reports, user management, settings, print previews, and finance formula setup are
not part of the mobile v1 scope.

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
├── src/                        # Next.js frontend + API routes
│   ├── app/                    # App Router (pages & API) — folders in Bahasa Indonesia
│   │   ├── api/                # REST API endpoints (Indonesian routes + legacy English shims)
│   │   ├── auth/               # Login
│   │   ├── beranda/            # Dashboard
│   │   ├── pos/                # Point of Sale / Kasir
│   │   ├── barang/             # Material & product (inventory items)
│   │   ├── inventori/          # Stock adjustments, opname, movement ledger
│   │   ├── pelanggan/          # Customer management
│   │   ├── vendors/            # Vendor management
│   │   ├── pembelian/          # Purchasing
│   │   ├── pesanan-pembelian/  # Purchase orders (auto-PO / reorder)
│   │   ├── retur-pembelian/    # Purchase returns
│   │   ├── retur-penjualan/    # Sales returns
│   │   ├── produksi/           # Production (SPK) & AI design-brief prompt
│   │   ├── surat-jalan/        # Delivery notes
│   │   ├── penawaran/          # Quotations
│   │   ├── keuangan/           # Cashbook + formula-driven finance summary
│   │   ├── laporan/            # Reports & PDF export
│   │   ├── laporan-ppn/        # VAT (PPN) report for Coretax cross-check
│   │   ├── kelola-pengurus/    # Profit-share / partner setup
│   │   ├── pengaturan/         # App settings (shop, pricing, PPN, numbering, printers)
│   │   ├── pengguna/           # User management
│   │   └── aktivitas/          # Audit log
│   ├── components/             # React components (names in Bahasa Indonesia)
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # Utilities, services, unified DB layer, AST formula engine
├── src-tauri/                  # Tauri desktop app (Rust)
│   ├── src/main.rs             # Entry point, embedded Next.js server lifecycle, sync
│   ├── src/sync.rs             # Offline-first sync engine
│   └── tauri.conf.json         # Tauri configuration
├── flutter/                    # Flutter mobile & mobile-web app
│   ├── lib/
│   │   ├── core/               # Config, theme, router, constants
│   │   ├── features/           # Feature pages (auth, pos, etc.)
│   │   ├── models/             # Dart data models
│   │   ├── providers/          # Riverpod state management
│   │   ├── services/           # API client & feature services
│   │   └── widgets/            # Shared UI components
│   └── pubspec.yaml            # Flutter dependencies
├── database/                   # SQLite template database + schema
├── supabase/                   # Supabase migrations + schema
├── scripts/                    # Build, release, seed & migration scripts
├── docs/                       # Setup & local-dev guides
├── updates/                    # Auto-updater manifest
└── tauri-bundle/               # Bundled resources for desktop installer
```

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, SWR (via `useCachedData`)
- **Desktop:** Tauri 2, Rust (embedded Next.js standalone + local SQLite + sync engine)
- **Mobile:** Flutter, Riverpod, GoRouter, Material 3
- **Database:** SQLite (desktop, via better-sqlite3) and Supabase Postgres (web + cloud sync), behind one unified data layer (`src/lib/db-unified.ts`)
- **Finance engine:** custom AST expression engine for the configurable cashbook (`src/lib/ast/`)
- **Auth:** JWT sessions with bcrypt password hashing
- **PDF:** jsPDF + jspdf-autotable for report printing
- **AI Tools Used:** GitHub Copilot, Cursor

