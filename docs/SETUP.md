# Developer Setup Guide

This guide helps you (or an AI agent) set up a fresh development machine for gemiprint.
Primary platform is **Linux** (Ubuntu/Debian or Fedora/Arch). Windows and macOS notes are kept for reference.

> **Panduan untuk AI agent:** Jalankan perintah di setiap langkah secara berurutan. Jika
> Cursor sudah login ke GitHub, Supabase, dan Vercel di browser-nya, agent bisa membuka
> halaman kredensial secara langsung (URL tersedia di setiap langkah). Jangan berhenti
> dan tanya kecuali ada error yang tidak bisa di-resolve sendiri.

---

## PENTING — Sebelum Menghapus Mesin Lama

Jalankan checklist ini dari mesin lama sebelum menghapus OS:

```bash
# 1. Pastikan semua kode sudah di-push ke GitHub
git status           # harus bersih atau semua sudah di-commit
git push             # pastikan tidak ada yang tertinggal

# 2. Cek apakah ada migration Supabase yang belum di-apply ke cloud
#    (jalankan dari folder repo)
npm run supabase:db:push
# Atau jika Supabase CLI ada di PATH:
# supabase db push --linked

# 3. Simpan file kunci ini di luar repo (Google Drive / USB):
#    - .env.local  (berisi semua secret)
#    - ~/.tauri/gemiprint.key  (signing key untuk desktop release)
#    - Backup akun: GitHub, Supabase, Vercel, GoDaddy login credentials
```

---

## Quick Overview

| Dependency | Diperlukan Untuk | Cara Install |
|---|---|---|
| Git | Semua | CLI |
| Node.js v22+ | Web app, Tauri | nvm (direkomendasikan) |
| Rust + Cargo | Tauri desktop app | rustup |
| Flutter SDK | Mobile + mobile web | snap / manual |
| Android Studio | Flutter Android builds | Manual (GUI) |
| Supabase CLI | DB migrations | npm |
| GitHub CLI | Release, PR management | apt / dnf |
| Cursor IDE | Editor + AI agent | .deb / AppImage |

---

## Langkah 1: Update Sistem & Install Git

```bash
# Ubuntu / Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential

# Fedora / RHEL
sudo dnf update -y
sudo dnf install -y git curl wget

# Arch / Manjaro
sudo pacman -Syu git curl wget base-devel
```

Verifikasi:
```bash
git --version
```

Konfigurasi Git (ganti dengan nama/email kamu):
```bash
git config --global user.name "gargilang"
git config --global user.email "your@email.com"
```

---

## Langkah 2: Node.js v22+ via nvm

nvm adalah cara terbaik di Linux — tidak perlu `sudo`, bisa switch versi kapan saja.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Muat nvm ke shell saat ini (atau buka terminal baru)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install dan aktifkan Node.js 22
nvm install 22
nvm use 22
nvm alias default 22

# Verifikasi
node --version   # harus v22.x.x
npm --version
```

---

## Langkah 3: Rust + Cargo (untuk desktop app Tauri)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Pilih opsi default (tekan Enter)

# Muat ke shell saat ini
source "$HOME/.cargo/env"

# Verifikasi
rustc --version
cargo --version
```

Tauri di Linux juga butuh library sistem:

```bash
# Ubuntu / Debian
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev

# Fedora
sudo dnf install -y webkit2gtk4.1-devel openssl-devel librsvg2-devel
```

---

## Langkah 4: Flutter SDK (untuk mobile app)

```bash
# Opsi A: via snap (paling mudah di Ubuntu)
sudo snap install flutter --classic
flutter sdk-path

# Opsi B: manual (jika snap tidak tersedia)
cd ~
curl -O https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_3.x.x-stable.tar.xz
# Cek versi terbaru di https://docs.flutter.dev/get-started/install/linux
tar xf flutter_linux_*.tar.xz
echo 'export PATH="$PATH:$HOME/flutter/bin"' >> ~/.bashrc
source ~/.bashrc
```

Verifikasi:
```bash
flutter --version
flutter doctor
```

---

## Langkah 5: Android Studio (untuk Flutter Android — manual)

> **Memerlukan interaksi manual.** AI agent perlu bantuan manusia di langkah ini
> karena melibatkan instalasi GUI.

1. Download dari https://developer.android.com/studio
2. Ekstrak dan jalankan installer
3. Buka Android Studio → SDK Manager → install Android SDK
4. Virtual Device Manager → buat emulator Android
5. Terima lisensi:
   ```bash
   flutter doctor --android-licenses
   ```

Verifikasi: `flutter doctor` — semua Android checklist harus hijau.

---

## Langkah 6: Supabase CLI

```bash
npm install -g supabase
supabase --version
```

---

## Langkah 7: GitHub CLI

```bash
# Ubuntu / Debian
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update && sudo apt install -y gh

# Fedora / RHEL
sudo dnf install -y gh

# Arch
sudo pacman -S github-cli
```

Autentikasi (browser akan terbuka otomatis):
```bash
gh auth login
# Pilih: GitHub.com → HTTPS → Login with a web browser
```

---

## Langkah 7b: Cursor IDE (Linux)

> **Untuk AI agent:** Cursor bisa di-install tanpa interaksi manual via `.deb` atau AppImage.

```bash
# Opsi A: Download .deb (Ubuntu/Debian) — cek versi terbaru di https://cursor.com/download
wget -O cursor.deb "https://downloader.cursor.sh/linux/appImage/x64"
# atau cari .deb di https://cursor.com/download

# Opsi B: AppImage (semua distro)
wget -O cursor.AppImage "https://downloader.cursor.sh/linux/appImage/x64"
chmod +x cursor.AppImage
./cursor.AppImage --appimage-extract-and-run
```

Setelah Cursor terpasang dan kamu login, semua MCP server (Supabase, Vercel, GitHub)
akan tersedia untuk AI agent karena konfigurasi MCP tersimpan di akun Cursor kamu.

---

## Langkah 7c: Desktop Updater Signing Key (hanya untuk rilis)

Kunci ini TIDAK ada di repo. Harus dipindah secara manual.

1. Ambil file `gemiprint.key` dari lokasi backup kamu (Google Drive / USB)
2. Taruh di:
   ```bash
   mkdir -p ~/.tauri
   cp /path/ke/gemiprint.key ~/.tauri/gemiprint.key
   ```

> **Keamanan:** Jangan pernah commit, paste ke chat, atau simpan di lokasi publik.

---

## Langkah 8: Clone dan Install Dependensi

```bash
# Clone repo
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio

# Install dependensi Node.js
npm install

# Install dependensi Flutter
cd flutter && flutter pub get && cd ..
```

---

## Langkah 9: Konfigurasi .env.local

```bash
cp .env.example .env.local
```

Edit `.env.local` dengan nilai-nilai berikut. AI agent bisa mengambil nilai-nilai ini
dari browser yang sudah login:

| Variable | Cara Mendapatkan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | [Supabase Dashboard → Settings → API](https://supabase.com/dashboard/project/_/settings/api) → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Halaman yang sama → Project API Keys → `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Halaman yang sama → Project API Keys → `service_role secret` |
| `SESSION_SECRET` | Generate dengan: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `DATABASE_URL` | [Supabase → Settings → Database](https://supabase.com/dashboard/project/_/settings/database) → Connection string (URI mode, tambah `?sslmode=require`) |
| `DIRECT_URL` | Halaman yang sama → Direct connection string |
| `PASSWORD_ENC_SECRET` | String random ≥ 32 karakter: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Contoh `.env.local` yang minimal untuk development:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=<64-char hex string>
PASSWORD_ENC_SECRET=<32-char hex string>
NEXT_PUBLIC_DB_MODE=hybrid
SYNC_ENGINE_V2=1
REALTIME_PULL_ENABLED=1
WEB_SERVER_MEDIATED_ONLY=1
SYNC_WAVE=1
```

---

## Langkah 10: Autentikasi Supabase CLI & Link Project

```bash
# Login ke Supabase (browser akan terbuka)
supabase login

# Cari project ID kamu di https://supabase.com/dashboard
# URL dashboard: https://supabase.com/dashboard/project/<PROJECT_ID>
supabase link --project-ref <PROJECT_ID>
```

---

## Langkah 11: Apply Migrasi Database ke Cloud

> **Penting:** Jalankan ini setelah `.env.local` dan Supabase CLI terkonfigurasi.
> Migrations di folder `supabase/migrations/` harus sinkron dengan cloud.

```bash
npm run supabase:db:push
```

Atau via Supabase CLI langsung:
```bash
supabase db push --linked
```

---

## Langkah 12: Verifikasi Semua Berjalan

```bash
# Type-check (harus 0 error)
npm run type-check

# Build production
npm run build

# Jalankan web app dev
npm run dev
# Buka http://localhost:3000

# (Opsional) Desktop app
npm run tauri:dev

# (Opsional) Flutter mobile
cd flutter && flutter run
```

---

## Langkah 13: Setup Vercel CLI (untuk deploy)

```bash
npm install -g vercel
vercel login    # pilih login dengan browser
vercel link     # link ke project gemiprint di Vercel
```

Atau AI agent bisa navigasi ke [Vercel Dashboard](https://vercel.com/dashboard) untuk
melihat environment variables yang sudah tersimpan di sana.

---

## Troubleshooting

| Problem | Solusi |
|---|---|
| `nvm: command not found` | Jalankan `source ~/.bashrc` atau buka terminal baru |
| `LIBSSL error` saat build Tauri | `sudo apt install libssl-dev pkg-config` |
| `flutter doctor` ada issues | Ikuti saran doctor untuk setiap issue |
| `npm install` gagal | Pastikan Node.js v22+ aktif: `node --version` |
| `SESSION_SECRET is not set` | Isi `.env.local` dengan nilai yang benar |
| `supabase: command not found` | `npm install -g supabase` lalu restart terminal |
| WebKit error saat Tauri | Install: `sudo apt install libwebkit2gtk-4.1-dev` |

---

## Matriks: Apa yang Perlu Di-install

| Kalau kamu hanya perlu... | Langkah wajib |
|---|---|
| Web app development | 1, 2, 8, 9, 10, 11, 12 |
| Desktop app development | 1, 2, 3, 7c, 8, 9, 10, 11, 12 |
| Mobile app development | 1, 2, 4, 5, 8, 9, 10, 11, 12 |
| Semua | Semua langkah |

---

## Untuk AI Agent: Alur Otomatis (Minimal Interaksi Manusia)

Urutan yang bisa dikerjakan agent tanpa bantuan manusia (asumsi Cursor sudah login):

```
1. Apt/dnf install system deps
2. Install nvm → Node 22
3. Install Rust via rustup
4. npm install -g supabase gh
5. git clone repo → npm install
6. cp .env.example .env.local
7. Buka browser Cursor → navigasi ke Supabase Dashboard → ambil Project URL + anon key + service role key
8. Generate SESSION_SECRET dan PASSWORD_ENC_SECRET via node -e
9. Tulis nilai ke .env.local
10. supabase login (via browser) → supabase link
11. npm run supabase:db:push
12. npm run type-check && npm run build
```

**Langkah yang memerlukan interaksi manusia:**
- Android Studio (GUI installer) — langkah 5
- Memasukkan password sudo (jika diminta)
- Menyetujui lisensi Android (`flutter doctor --android-licenses`)
- Memindahkan `gemiprint.key` dari backup — langkah 7c
