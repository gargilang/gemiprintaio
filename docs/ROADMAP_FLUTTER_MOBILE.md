# Roadmap: Flutter Mobile App (Android + Mobile Web)

Target: replika penuh gemiprint web app dalam Flutter, online-only via Next.js API routes, deploy sebagai Android APK + Flutter web di m.gemiprint.com.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       Client Apps                            │
│                                                              │
│  app.gemiprint.com     Desktop (Tauri)     Mobile / mWeb     │
│  Next.js 16            SQLite + Sync       Flutter            │
│  (browser langsung)    (offline-first)     (online-only)      │
│       │                     │                   │             │
│       ▼                     ▼                   │             │
│   Next.js API Routes  ◄── Supabase sync         │             │
│   (Vercel server)                               │             │
│       │                                         │             │
│       │     ┌───────────────────────────────┐    │             │
│       └────►│  Supabase Postgres (RLS)      │◄───┘             │
│             │  via service_role (server)     │  via API routes  │
│             └───────────────────────────────┘  (app.gemiprint) │
└──────────────────────────────────────────────────────────────┘
```

### Kenapa Flutter TIDAK konek langsung ke Supabase?

Beberapa user tidak bisa mengakses `supabase.com` dari network mereka. Web app dan desktop app sudah mengatasi ini dengan:
- **Web**: browser → `app.gemiprint.com` (Vercel) → Supabase (server-side)
- **Desktop**: SQLite lokal sebagai primary, sync ke Supabase di background

Flutter app menggunakan pendekatan yang sama seperti web app:
- Flutter → `app.gemiprint.com/api/*` → Supabase (server-side)
- User hanya perlu akses ke `app.gemiprint.com`, tidak perlu akses ke `supabase.com`

### Perubahan pada Next.js backend

Agar Flutter bisa menggunakan API routes yang sudah ada:
1. **Middleware** (`src/middleware.ts`): tambah support `Authorization: Bearer <token>` selain cookie
2. **Login endpoint** (`src/app/api/auth/login/route.ts`): return JWT token di response body (selain set cookie)
3. Flutter simpan token di `flutter_secure_storage`, kirim sebagai Bearer header

---

## Konfigurasi

- **Online-only**: tidak perlu SQLite lokal atau sync engine. Semua data via API routes.
- **Android-only** untuk native build; Flutter web untuk m.gemiprint.com.
- **Auth**: login via `POST /api/auth/login`, terima JWT, simpan di secure storage, kirim sebagai Bearer header.
- **State management**: Riverpod.
- **UI**: Material 3 dengan tema gemiprint (brand colors: `#00afef`, `#0a1b3d`, `#2266ff`).
- **Lokasi project**: `flutter/` di root repo (monorepo, sama seperti `src-tauri/`).

---

## Phase 1 — Project Setup + Core Infrastructure

| # | Task | Status |
|---|------|--------|
| 1.1 | Init Flutter project di `flutter/` dengan pubspec.yaml | ✅ |
| 1.2 | Setup API client (http/dio) ke `app.gemiprint.com/api/*` | ✅ |
| 1.3 | Update Next.js middleware: support Bearer token auth | ✅ |
| 1.4 | Update login endpoint: return JWT di response body | ✅ |
| 1.5 | Buat tema Material 3 gemiprint (brand colors, fonts) | ✅ |
| 1.6 | Setup GoRouter dengan semua route definitions | ✅ |
| 1.7 | Buat data models dari `src/types/database.ts` | ✅ |

---

## Phase 2 — Authentication

| # | Task | Status |
|---|------|--------|
| 2.1 | Login page UI | ✅ |
| 2.2 | Auth service: call `/api/auth/login`, simpan JWT di secure storage | ✅ |
| 2.3 | Auth state provider (Riverpod) | ✅ |
| 2.4 | Route guard (redirect unauthenticated ke login) | ✅ |
| 2.5 | Role-based access control (ADMIN_ONLY, FULL_STAFF, dll) | ✅ |

---

## Phase 3 — App Shell + Navigation

| # | Task | Status |
|---|------|--------|
| 3.1 | Main shell dengan drawer / bottom nav (mobile-optimized) | ✅ |
| 3.2 | Role-based menu filtering | ✅ |
| 3.3 | App bar dengan user info | ✅ |
| 3.4 | Dashboard page (placeholder) | ✅ |

---

## Phase 4 — Master Data Pages (CRUD sederhana)

| # | Task | Status |
|---|------|--------|
| 4.1 | Customers page — CRUD, search, member status | ✅ |
| 4.2 | Vendors page — CRUD, search | ✅ |
| 4.3 | Materials page — CRUD, categories, multi-unit pricing | ✅ |
| 4.4 | Shared widgets: SearchableSelect, ConfirmDialog, form modals | ✅ |

---

## Phase 5 — POS / Kasir (fitur paling kompleks)

| # | Task | Status |
|---|------|--------|
| 5.1 | Product search dengan categories dan filtering | ✅ |
| 5.2 | Cart management dengan dimension-based pricing | ✅ |
| 5.3 | Finishing options per item | ✅ |
| 5.4 | Payment flow (cash, transfer, QRIS, card, receivable) | ✅ |
| 5.5 | Invoice generation | ✅ |
| 5.6 | Sales history dengan search/filter | ✅ |
| 5.7 | Receivables management (piutang) | ✅ |

---

## Phase 6 — Production + Purchases

| # | Task | Status |
|---|------|--------|
| 6.1 | Production order list dengan status workflow | ✅ |
| 6.2 | Production item tracking (per item status) | ✅ |
| 6.3 | Purchase order form dengan line items | ✅ |
| 6.4 | Debt management (hutang) + payment modal | ✅ |

---

## Phase 7 — Finance + Reports

| # | Task | Status |
|---|------|--------|
| 7.1 | Cash book entry management | ✅ |
| 7.2 | Profit sharing calculations | ✅ |
| 7.3 | Report generation | ✅ |
| 7.4 | PDF export (package `pdf` + `printing`) | ⬜ |

---

## Phase 8 — Users + Settings

| # | Task | Status |
|---|------|--------|
| 8.1 | User management page (admin only) | ✅ |
| 8.2 | Master data settings (categories, units, finishing options) | ✅ |
| 8.3 | Drag-and-drop reordering | ⬜ |

---

## Phase 9 — Polish + Testing

| # | Task | Status |
|---|------|--------|
| 9.1 | Error handling dan loading states | ✅ |
| 9.2 | Indonesian locale di seluruh app | ✅ |
| 9.3 | Performance optimization | ✅ |
| 9.4 | Cleanup file-file yang tidak terpakai di repo | ✅ |

---

## Phase 10 — Flutter Web + Mobile Redirect

| # | Task | Status |
|---|------|--------|
| 10.1 | Build Flutter web target | ✅ |
| 10.2 | Deploy ke Vercel sebagai static site untuk m.gemiprint.com | ✅ |
| 10.3 | Configure GoDaddy DNS (A record m → 76.76.21.21) | ✅ |
| 10.4 | Tambah mobile user-agent redirect di Next.js middleware | ✅ |
| 10.5 | Test end-to-end redirect flow | ⬜ (menunggu DNS propagasi) |

---

## Dependencies Flutter (pubspec.yaml)

```yaml
dependencies:
  flutter_riverpod: ^2.x
  riverpod_annotation: ^2.x
  go_router: ^14.x
  flutter_secure_storage: ^9.x
  http: ^1.x               # HTTP client untuk API calls
  pdf: ^3.x
  printing: ^5.x
  intl: ^0.19.x
  uuid: ^4.x
```

Catatan: `supabase_flutter` TIDAK digunakan. Flutter konek ke Supabase via Next.js API routes.

---

## Pages yang di-replika (12 halaman)

| # | Page | Route | Sumber Next.js |
|---|------|-------|----------------|
| 1 | Login | `/login` | `src/app/auth/login/page.tsx` |
| 2 | Dashboard | `/dashboard` | `src/app/dashboard/page.tsx` |
| 3 | POS | `/pos` | `src/app/pos/page.tsx` |
| 4 | Production | `/production` | `src/app/production/page.tsx` |
| 5 | Materials | `/materials` | `src/app/materials/page.tsx` |
| 6 | Purchases | `/purchases` | `src/app/purchases/page.tsx` |
| 7 | Customers | `/customers` | `src/app/customers/page.tsx` |
| 8 | Vendors | `/vendors` | `src/app/vendors/page.tsx` |
| 9 | Finance | `/finance` | `src/app/finance/page.tsx` |
| 10 | Reports | `/reports` | `src/app/reports/page.tsx` |
| 11 | Users | `/users` | `src/app/users/page.tsx` |
| 12 | Settings | `/settings` | `src/app/settings/page.tsx` |

---

## Mobile Redirect Strategy

1. ✅ Tambah deteksi user-agent di `src/middleware.ts` (Next.js) untuk redirect mobile → `m.gemiprint.com`
2. ✅ Setup A record `m.gemiprint.com` → `76.76.21.21` di GoDaddy DNS
3. ✅ Deploy Flutter web build ke Vercel (project: `web`, domain: `m.gemiprint.com`)
4. ⬜ End-to-end test setelah DNS propagasi selesai (biasanya < 1 jam, maks 48 jam)
