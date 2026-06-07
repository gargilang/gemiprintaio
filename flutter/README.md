# gemiprint Flutter

Flutter client for gemiprint Android and mobile web. This app is online-only and
talks to the Next.js API at `https://app.gemiprint.com`.

## Scope

The Flutter app is intentionally small and practical for backup/emergency use:

- Dashboard
- POS / Kasir
- SPK / Produksi
- Data Barang
- Pembelian
- Pelanggan
- Vendor
- Keuangan sederhana

Web/desktop-only features such as Surat Jalan, AI Prompt, Log Audit, Reports,
settings, user management, print previews, and finance formula setup are not part
of the mobile v1 scope.

## Development

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=https://app.gemiprint.com
```

For mobile web development:

```bash
flutter run -d web-server --web-port=8080 --dart-define=API_BASE_URL=https://app.gemiprint.com
```

Open `http://localhost:8080/login`. Routing is path-based, so do not use
`/#/login`.

## Android Release

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://app.gemiprint.com
```

Output:

```text
build/app/outputs/flutter-apk/app-release.apk
```

## Mobile Web Release

**Otomatis (default):** setiap push ke `main` yang mengubah `flutter/**`
memicu workflow `.github/workflows/deploy-mobile-web.yml`, yang mem-build
Flutter web dan men-deploy ke project Vercel `gemiprint-mobile-web`
(alias `m.gemiprint.com`). Tidak ada langkah manual yang diperlukan.
Workflow juga bisa dijalankan manual via tab Actions ("Run workflow").

Butuh GitHub Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

**Manual (fallback)** jika perlu deploy dari lokal tanpa menunggu CI:
`m.gemiprint.com` is a separate static Vercel project. Build and deploy the
Flutter web output:

```bash
flutter build web --dart-define=API_BASE_URL=https://app.gemiprint.com
cd build/web
npx vercel --prod
npx vercel alias set <deployment-url> m.gemiprint.com --scope gemiprint
```

`web/vercel.json` is copied into `build/web` by Flutter and configures Vercel to
rewrite every route to `index.html`, which keeps `/login`, `/pos`, `/production`,
and other GoRouter paths working after refresh.

Current production setup:

- Vercel team: `gemiprint`
- Vercel project: `gemiprint-mobile-web`
- Production alias: `https://m.gemiprint.com`
