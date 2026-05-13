# gemiprint

Aplikasi manajemen untuk bisnis percetakan — mencakup POS (Point of Sale), inventori bahan, manajemen pelanggan & vendor, produksi, pembelian, keuangan (kas masuk/keluar), dan laporan.

Tersedia dalam dua bentuk:

| Platform | Teknologi | Penyimpanan |
|----------|-----------|-------------|
| **Web** | Next.js di Vercel | Supabase (cloud Postgres) |
| **Desktop** | Tauri + Next.js standalone | SQLite lokal + sync ke Supabase |

## Download Desktop App

> **Windows (64-bit):** [gemiprint_0.1.0_x64_en-US.msi](https://github.com/gargilang/gemiprintaio/releases/latest)

Buka halaman [Releases](https://github.com/gargilang/gemiprintaio/releases) untuk semua versi.

Desktop app akan otomatis memberi notifikasi jika ada versi baru tersedia.

## Prasyarat Development

- [Node.js](https://nodejs.org/) v22+
- [Rust](https://rustup.rs/) (untuk build desktop)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (untuk migrasi database)

## Setup

```bash
# 1. Clone repo
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio

# 2. Install dependencies
npm install

# 3. Buat file environment
cp .env.example .env.local   # lalu isi nilai-nilainya
```

### Environment Variables

Buat file `.env.local` di root project:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...
SESSION_SECRET=random-string-32-chars-min
```

## Development

```bash
# Web app saja (port 3000)
npm run dev

# Desktop app saja (port 3001 + Tauri window)
npm run tauri:dev

# Keduanya bersamaan
npm run dev:all
```

## Build

### Web (Vercel)

Push ke `main` — Vercel otomatis deploy.

### Desktop (Windows Installer)

```bash
npm run tauri:build
```

Output:
- `src-tauri/target/release/bundle/msi/gemiprint_x.x.x_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/gemiprint_x.x.x_x64-setup.exe`

## Rilis Update Desktop

```bash
# 1. Bump versi di src-tauri/tauri.conf.json dan src-tauri/Cargo.toml
# 2. Build
npm run tauri:build
# 3. Sign, upload ke GitHub Releases, dan update manifest
npm run release:desktop
```

Script `release:desktop` akan otomatis:
1. Menandatangani installer dengan private key
2. Membuat GitHub Release dan upload installer
3. Mengupdate `updates/latest.json` dan push ke `main`

Desktop app user akan menerima notifikasi update otomatis.

> **Catatan:** Private signing key (`%APPDATA%\.tauri\gemiprint.key`) harus tersedia di mesin developer. Simpan backup di tempat aman.

## Struktur Project

```
gemiprintaio/
├── src/                    # Next.js frontend + API routes
│   ├── app/                # App router (pages & API)
│   │   ├── api/            # REST API endpoints
│   │   ├── auth/           # Halaman login
│   │   ├── dashboard/      # Dashboard utama
│   │   ├── pos/            # Point of Sale
│   │   ├── materials/      # Manajemen bahan/barang
│   │   ├── customers/      # Manajemen pelanggan
│   │   ├── vendors/        # Manajemen vendor
│   │   ├── purchases/      # Pembelian
│   │   ├── production/     # Produksi & finishing
│   │   ├── finance/        # Keuangan (kas masuk/keluar)
│   │   ├── reports/        # Laporan & cetak
│   │   ├── settings/       # Pengaturan
│   │   └── users/          # Manajemen pengguna
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utilities, services, database layer
├── src-tauri/              # Tauri desktop app (Rust)
│   ├── src/main.rs         # Entry point, server lifecycle, sync
│   ├── src/sync.rs         # Offline-first sync engine
│   └── tauri.conf.json     # Tauri configuration
├── database/               # SQLite template DB
├── supabase/               # Supabase migrations
├── scripts/                # Build & release scripts
├── updates/                # Auto-updater manifest
└── tauri-bundle/           # Bundled resources for desktop installer
```

## Teknologi

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Desktop:** Tauri 2, Rust
- **Database:** SQLite (desktop, via better-sqlite3), Supabase Postgres (web + cloud sync)
- **Auth:** JWT sessions dengan bcrypt password hashing
- **PDF:** jsPDF + jspdf-autotable untuk cetak laporan
