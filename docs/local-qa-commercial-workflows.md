# Local QA Setup for Commercial Workflows V1

This note documents how to authenticate against the local SQLite database
when verifying the new commercial-workflow pages.

## Why this exists

By default, `next dev` on this repo talks to Supabase. The new V1 services
(penawaran, PO, retur, opname, movement ledger) are exercised against
whatever the repo is configured to hit. To do realistic local QA without
poking production data, switch to the local SQLite mirror.

## One-time setup

```bash
# Seed (or reset) a local admin user in ./database/gemiprint.db
npm run seed:local-admin
# user: admin / pass: admin123
```

The seed script:

- Only writes to `./database/gemiprint.db` (never Supabase).
- Is idempotent: running it again resets the password and forces
  `role = admin`, `aktif_status = 1`.
- Accepts overrides: `node scripts/seed-local-admin.mjs --user=foo --password=bar`.

## Run the dev server in SQLite mode

The mirror is gated behind an env flag so it stays opt-in:

```bash
# bash / zsh / git-bash / WSL
GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR=1 npm run dev

# PowerShell
$env:GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR='1'; npm run dev
```

If port 3000 is in use because Supabase-mode dev is still running,
either stop that process or use `next dev -p 3030`.

## Pages that need authenticated QA

After login at `/auth/login`:

- `/penawaran` — buat draft, accept, convert (modal pilih CASH/TRANSFER/NET30 + DP)
- `/purchase-orders` — buat PO, mark sent, receive partial → PARTIAL_RECEIVED, full → RECEIVED, modal pilih metode bayar + DP
- `/sales-returns` — pilih invoice, retur 1 line, qty > sisa harus ditolak, refund cashbook hanya bagian terbayar, sisanya RETUR_PENJUALAN_NONCASH
- `/purchase-returns` — retur dari pembelian, hutang dikurangi dulu lalu refund vendor (lihat edge cases unpaid/partial/fully paid)
- `/hutang` — bayar partial, revert payment (konfirmasi muncul)
- `/inventory/adjustments` — pilih reason MANUAL/CORRECTION/WASTE, posting
- `/inventory/opname` — sesi baru → input fisik → posting (delta nol tidak bikin movement)
- `/inventory/movements` — filter tanggal/barang/tipe, klik link source, export CSV

## Acceptance checks per page

- empty state, loading state, error state
- create/post/convert/receive/pay/revert flow happy path
- filter / search bekerja
- print preview untuk Penawaran dan PO (layout proper, ada tabel + total)
- role guard: login non-admin tidak boleh akses (lihat actions.ts → `requireAdminOrManager`)
- tidak ada console error di DevTools

## Troubleshooting

- `Username tidak ditemukan` saat login: dev server tidak pakai SQLite
  mirror — restart dengan `GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR=1`, atau
  jalankan `npm run seed:local-admin` lagi.
- `SQLITE_CONSTRAINT: CHECK constraint failed: movement_type` saat retur
  penjualan: SQLite lokal masih punya CHECK constraint lama. Bootstrap
  otomatis akan rebuild table saat dev server boot ulang (lihat
  `migrateInventoryMovementsCheckConstraint` di `src/lib/db-unified.ts`).
- Supabase staging: jalankan `npm run supabase:migrate:apply` setelah
  push migrasi `20260525130000_return_non_cash_revenue.sql` agar
  kategori `RETUR_PENJUALAN_NONCASH` terbentuk.
