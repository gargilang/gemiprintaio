# gemiprint Codebase Cleanup - Master Plan

> **Untuk agentic workers:** WAJIB gunakan skill superpowers:subagent-driven-development atau superpowers:executing-plans untuk mengeksekusi plan ini task demi task. Gunakan sintaks checkbox (`- [ ]` / `- [x]`) untuk tracking.

**Tujuan:** Membersihkan, menyederhanakan, dan meningkatkan kualitas seluruh codebase gemiprint agar mudah di-maintain, efisien, dan bebas dari dead code.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres, SQLite (better-sqlite3), Tailwind CSS 4, SWR (useCachedData), Jest

---

## Legenda Status

- `[x]` = Sudah selesai dikerjakan
- `[ ]` = Belum dikerjakan
- `[-]` = Di-skip (terlalu tightly-coupled, butuh sesi tersendiri)

---

## Fase 1-6: Selesai (Sesi 1)

- [x] **Task 1:** Hapus `use-async-data.ts` (dead code) — commit `3220855`
- [x] **Task 2:** Hapus `BagiHasilManageModal.tsx` (dead code) — commit `60daf46`
- [x] **Task 3:** Fix N+1 query di `getMaterials()` — commit `d33c295`
- [x] **Task 4:** Bersihkan `console.log` di 8 file production — commit `e4daaf2`
- [x] **Task 5:** Migrasi Flutter endpoint English ke Indonesian — commit `7bba0ec`
- [x] **Task 6:** Hapus 8 folder API shim English di Next.js — commit `4503523`
- [x] **Task 7:** Pecah `db-unified.ts` menjadi `db-supabase.ts` + `db-sqlite.ts` + router tipis — commit `8f78518`
- [x] **Task 8 (plan asli):** Pecah `pos-service.ts` menjadi `pos-queries.ts` + `pos-mutations.ts` — commit `2ba45c1`
- [x] **Task 9 (plan asli):** Pecah `purchases-service.ts` menjadi `purchases-queries.ts` + `purchases-mutations.ts` — commit `6539ff8`

---

## Fase 7-9: Selesai (Sesi 2)

- [x] **Task 15:** Pecah `db-sqlite.ts` (2490 baris) menjadi `db-sqlite-schema.ts` + `db-sqlite-migrations.ts` — commit `01b7bfd`
- [x] **Task 16:** Tambah role guard ke semua mutation API routes (26 file) — commit `60ff541`
- [x] **Task 10:** Pecah `pengaturan/page.tsx` (4458 baris) menjadi 4 komponen tab — commit `0f7266e`

---

## Fase 7: Pecah Komponen UI Besar (Di-skip — Monolitik)

- [-] **Task 11:** Pecah `FormulirPembelian.tsx` (1522 baris) — state terlalu tightly-coupled, butuh sesi refactor tersendiri
- [-] **Task 12:** Pecah `ModalTambahBarang.tsx` (1186 baris) — sama, butuh sesi tersendiri
- [-] **Task 13:** Pecah `pos/page.tsx` (2083 baris) — tidak ada tab structure, monolitik
- [-] **Task 14:** Pecah `keuangan/page.tsx` (2049 baris) — state terlalu tightly-coupled

---

## Fase 8: Gap Tambahan

- [ ] **Task 17:** Kurangi TypeScript `any` di `pos-mutations.ts`, `purchases-mutations.ts`, `reports-service.ts`
- [ ] **Task 18:** Pecah file page besar lainnya (`barang/page.tsx` 1603, `pengguna/page.tsx` 1387, `produksi/spk/page.tsx` 1239, `finance/PengaturanKeuanganModal.tsx` 1266, `finance/ExpressionAssistant.tsx` 1176, `TabelRiwayatPenjualan.tsx` 1001)

---

## Fase 9: Verifikasi Akhir

- [ ] **Task 19:** Full verification pass — type-check, tests, build, smoke test

---

## Ringkasan Status

| Task | Deskripsi | Status |
| ---- | --------- | ------ |
| 1 | Hapus use-async-data.ts | ✅ Selesai |
| 2 | Hapus BagiHasilManageModal.tsx | ✅ Selesai |
| 3 | Fix N+1 query getMaterials() | ✅ Selesai |
| 4 | Bersihkan console.log | ✅ Selesai |
| 5 | Migrasi Flutter endpoint | ✅ Selesai |
| 6 | Hapus 8 folder API shim | ✅ Selesai |
| 7 | Pecah db-unified.ts | ✅ Selesai |
| 8 | Pecah pos-service.ts | ✅ Selesai |
| 9 | Pecah purchases-service.ts | ✅ Selesai |
| 10 | Pecah pengaturan/page.tsx | ✅ Selesai |
| 11 | Pecah FormulirPembelian.tsx | ⏭ Di-skip |
| 12 | Pecah ModalTambahBarang.tsx | ⏭ Di-skip |
| 13 | Pecah pos/page.tsx | ⏭ Di-skip |
| 14 | Pecah keuangan/page.tsx | ⏭ Di-skip |
| 15 | Pecah db-sqlite.ts | ✅ Selesai |
| 16 | Role guard mutation API routes | ✅ Selesai |
| 17 | Kurangi TypeScript any | ⏳ Belum |
| 18 | Pecah file page besar lainnya | ⏳ Belum |
| 19 | Verifikasi akhir | ⏳ Belum |

---

*Terakhir diperbarui: 2026-06-04*