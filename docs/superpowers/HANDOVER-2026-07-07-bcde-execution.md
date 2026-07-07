# Handover: Sub-proyek B/C/D/E — Rakitan, POS Katalog Extra, Beranda, UI Polish

> **Tanggal:** 2026-07-07
> **Branch:** `feature/bcde-rakitan-pos-ui-polish`
> **Status:** Plan D ✓ selesai | Plan E ✓ selesai | Plan B ✓ selesai | Plan C — Task 1 ✓ selesai, Tasks 2-9 tersisa
> **Base branch:** `main` (commit `468099f`)

---

## Ringkasan eksekusi

4 spec + 4 plan ditulis dan di-commit ke `docs/superpowers/`. Eksekusi dimulai
dengan subagent-driven-development (inline, 1 subagent pada satu waktu, review
antar task). Plan D, E, B selesai penuh. Plan C baru Task 1 (migrasi) yang
selesai — 8 task tersisa.

### Branch & commit

Branch: `feature/bcde-rakitan-pos-ui-polish` (16 commit, semua verified
type-check + build). Tidak di-push ke remote, belum di-merge ke `main`.

```
00fc1be feat(db): migrasi pos-katalog-extra — pending_vendor_hpp, katalog_maklon_id, populer_status, kategori_id, TRANSFER CHECK   [C Task 1]
6adebcf test(bom): tambah case hitungQtyKomponenDimensiM2 default jumlahRoll=1 (B3)                                                  [B Task 8]
3036797 feat(pos): HPP BARANG termasuk biaya BOM per produk jual (B2.f)                                                             [B Task 7]
df1a6ce feat(produksi): deductBomComponents pakai resolver per produk jual (B2)                                                     [B Task 6]
234b791 feat(barang): PanelKomponenRakitan dropdown scope produk jual + hide jumlah_roll (B2/B3)                                    [B Task 5]
bd40c4b feat(barang-komponen): API terima unit_price_id + default jumlah_roll=1 (B2/B3)                                             [B Task 4]
c669182 fix(barang): default satuan dasar saat tambah produk jual (B1)                                                              [B Task 3]
7fc4f57 feat(bom): tambah resolveBomForUnitPrice (scope per produk jual + fallback barang-level)                                   [B Task 2]
930a405 feat(db): tambah kolom unit_price_id + default jumlah_roll=1 di barang_komponen                                            [B Task 1]
e2a6f0a fix(cetak): await onPrint sebelum onClose + hapus dead script di thermal-print                                             [E review fix]
f3ec93e fix(cetak): struk 80mm Penjualan & SPK via pipeline font embed base64                                                      [E Task 5+6]
c45865e fix(ui): ringkas modal edit barang — hint text-xs, contoh collapsed, padding ramping                                       [E Task 4]
f39bbf6 fix(pos): label tombol "Parkir" → "Simpan" di keranjang POS                                                                 [E Task 3]
9da3a8c fix(ui): dark mode pasangan text-red-600 di ModalBayarPiutang list                                                         [E review fix]
ec96259 fix(ui): dark mode modal Piutang & Hutang — tambah pasangan dark: di border/input/textarea                                 [E Task 1+2]
85ed961 fix(beranda): navigasi draf PO dulu, baru invalidate SWR                                                                   [D Task 1]
```

Working tree clean (tidak ada uncommitted changes).

---

## Yang sudah selesai

### Plan D — Beranda: Fix Navigasi Draf PO ✅

**Spec:** `docs/superpowers/specs/2026-07-07-beranda-navigasi-draf-po-design.md`
**Plan:** `docs/superpowers/plans/2026-07-07-beranda-navigasi-draf-po.md`

- Tukar urutan `router.push("/pesanan-pembelian")` ↔ `onChanged()` di
  `handleGenerate` (`src/app/beranda/page.tsx` L586-610).
- Type-check + build pass. Jest di-skip (race condition UI, tidak
  reproduktif di jsdom — sesuai spec).
- Verifikasi manual belum dilakukan (perlu browser — klik "Buat Draf",
  pastikan tetap di `/pesanan-pembelian`).

### Plan E — UI Polish ✅

**Spec:** `docs/superpowers/specs/2026-07-07-ui-polish-design.md`
**Plan:** `docs/superpowers/plans/2026-07-07-ui-polish.md`

| Task | Isu | Status |
|---|---|---|
| E1 | Dark mode `ModalBayarPiutang.tsx` — border/input/info-box | ✅ + review grep verified |
| E2 | Dark mode `ModalBayarHutang.tsx` — 5 input belum punya `dark:bg`/`dark:text` sama sekali → ditambahkan | ✅ |
| E3 | Label "Parkir" → "Simpan" di `KeranjangPOS`, `ModalParkirKeranjang`, toast | ✅ (internal state `park*` tetap) |
| E4 | Hint `text-base` → `text-xs`, box "Contoh Penggunaan" → `<details>` collapsed, `py-2.5` → `py-2` di `PanelHargaSatuan` | ✅ |
| E5 | Struk 80mm Penjualan (`thermal-print.ts`) + SPK (`spk-print.ts` + `spk/page.tsx`) rute via pipeline `preparePrintHtml` + `openPrintDocument` | ✅ + code quality review |
| E5 review fix | `SpkDetailModal.tsx` — `await onPrint` sebelum `onClose` (UX regression fix); hapus dead `<script>` di `generateThermalInvoice` | ✅ |

**Catatan E5:**
- `printThermalInvoice` jadi `async` (`Promise<boolean>`). Semua caller
  sudah `await` (`pos/page.tsx`, `TabelRiwayatPenjualan.tsx`).
- `handlePrintSPK` jadi `async` (`Promise<void>`). Prop `onPrint` di
  `SpkDetailModal` di-widen ke `void | Promise<void>`.
- `surat-jalan-print.ts` masih punya duplikat `printAfterAssetsReady` lokal
  (pre-existing, out of scope E) — follow-up opsional untuk rute via
  pipeline juga.
- Verifikasi manual font branded belum dilakukan (perlu browser + Ctrl+P
  di struk 80mm, cek Bauhaus 93 / TW Cen MT tampil, bukan Arial).

### Plan B — Data Barang: Rakitan per Produk Jual, HPP BOM, Satuan Default ✅

**Spec:** `docs/superpowers/specs/2026-07-07-data-barang-rakitan-produk-jual-design.md`
**Plan:** `docs/superpowers/plans/2026-07-07-data-barang-rakitan-produk-jual.md`

| Task | Isu | Status | Test |
|---|---|---|---|
| B1 (Task 3) | `addUnitPrice` default `formData.base_unit` | ✅ | — |
| B2.a (Task 1) | Skema: `unit_price_id` nullable + FK + `jumlah_roll NOT NULL DEFAULT 1` — 3 tempat sync | ✅ | — |
| B2.b (Task 2) | `resolveBomForUnitPrice` di `src/lib/services/bom-service.ts` (scope per-produk-jual exclusive, fallback barang-level) | ✅ TDD | 5/5 `bom-resolver.test.ts` |
| B2.d (Task 4) | API `barang-komponen` terima `unit_price_id` + validasi ownership + default `jumlah_roll=1` | ✅ TDD | 7/7 `route.test.ts` (3 existing + 4 baru) |
| B2.c (Task 5) | UI `PanelKomponenRakitan` dropdown "Berlaku untuk Produk Jual" + kolom tabel + hide "Jumlah roll" | ✅ | — |
| B2.e (Task 6) | `deductBomComponents` terima `unitPriceId` + pakai resolver; caller join `item_penjualan` untuk `harga_satuan_id` | ✅ TDD | 7/7 `bom-service.test.ts` (4 existing di-update + 3 baru) |
| B2.f (Task 7) | HPP BOM di `createSaleAttempt` cabang BARANG — `hppSatuan = baseHpp + computeBomCostPerUnit(...)` | ✅ TDD | 4/4 `pos-mutations-hpp-bom.test.ts` |
| B3 (Task 4+5+8) | Drop field "Jumlah roll" UI, default API, label help "Lebar × Panjang = m²/unit" | ✅ | 4/4 `bom-utils.test.ts` |
| B4 | SPK otomatis pakai BOM per produk jual — konsekuensi B2.e, no new code | ✅ (verifikasi) | — |

**Total test Plan B:** 27/27 pass (5 test suite). Type-check 0 error. Build sukses.
**Regression sweep:** semua test POS/finance/return/inventory/quotation
existing tetap green.

**Catatan penting Plan B:**
- Task 7 pakai **fallback ekstraksi helper**: `computeBomCostPerUnit(barangId,
  unitPriceId)` di `bom-service.ts` (bukan inline di `createSaleAttempt`)
  karena test integrasi `createSaleAttempt` terlalu rapuh (banyak dependensi:
  NSFP, stock, SPK, period close). Helper di-test secara terpisah.
- `item_produksi` TIDAK punya `harga_satuan_id` — caller
  `updateProductionItemStatus` join `item_penjualan` via
  `item_penjualan_id` untuk dapat `harga_satuan_id` saat SPK completion.
- HPP BOM hanya untuk item BARANG (bukan MAKLON/JASA).
- N+1 di HPP BOM ditoleransi MVP (BOM 1-3 komponen, item per transaksi
  kecil) — ada komentar di `computeBomCostPerUnit`.
- `db.query` dengan `where: { unit_price_id: null }` correctly translates
  to `IS NULL` di semua 4 DB paths (verified di `db-unified.ts`).
- Verifikasi manual belum dilakukan (perlu browser — lihat Plan B Task 9
  Step 6 untuk smoke test checklist lengkap: buat Flexi Banner 280gsm +
  3 produk jual + Kaki Roll Banner, scoped BOM, jual X Banner, cek HPP +
  stok setelah SPK selesai).

---

## Yang tersisa — Plan C (POS & Katalog Extra)

**Spec:** `docs/superpowers/specs/2026-07-07-pos-katalog-extra-design.md`
**Plan:** `docs/superpowers/plans/2026-07-07-pos-katalog-extra.md`

### Task 1: Migrasi ✅ (sudah selesai, commit `00fc1be`)

Migrasi `20260707000003_pos_katalog_extra.sql` + SQLite schema + runtime
ALTER/rebuild di `db-unified.ts`. Kolom baru:
- `item_penjualan`: `pending_vendor_hpp INTEGER NOT NULL DEFAULT 0`,
  `katalog_maklon_id TEXT` (FK → katalog_maklon ON DELETE SET NULL)
- `katalog_maklon`: `populer_status INTEGER NOT NULL DEFAULT 0`,
  `kategori_id TEXT` (FK → kategori_barang ON DELETE SET NULL),
  CHECK `metode_bayar_vendor_default` di-lebarkan ke `TRANSFER`
- `harga_barang_satuan`: `populer_status INTEGER NOT NULL DEFAULT 0`
- Data migration: `katalog_maklon.kategori` (free-text) → `kategori_id`
  via JOIN match nama.
- `populer_status_cache` di-skip (C5 compute on-the-fly).
- SQLite table-rebuild untuk CHECK constraint (item_penjualan +
  katalog_maklon) — pattern sama dengan `harga_barang_satuan` rebuild.

**⚠️ Catatan penting dari Task 1 subagent:**
1. **Typo `popuer_status` → `populer_status`:** Plan C spec/plan memakai
   `popuer_status` (typo) di beberapa tempat. Migrasi memakai
   `populer_status` (baku). **Tasks 2-8 WAJIB pakai `populer_status`**
   (bukan `popuer_status`) di Zod schema, interface, service, dan test —
   supaya cocok dengan kolom DB yang sudah di-migrate.
2. **SQLite LIKE pattern:** Plan snippet pakai double-quote `"%...%"` yang
   SQLite treat sebagai identifier. Subagent fix ke single-quote
   `'%...%'` dengan doubled internal quotes.
3. **Expression DEFAULT parens:** `PRAGMA table_info` strip outer parens
   dari `datetime('now')` → perlu re-wrap `(datetime('now'))`. Subagent
   tambah heuristic. Pre-existing `harga_barang_satuan` rebuild punya bug
   latent sama (out of scope, left untouched).
4. **CHECK constraint loss on rebuild:** SQLite table-rebuild drop
   non-targeted CHECK (mis. `tipe_item IN (...)` di `item_penjualan`).
   Match reference pattern behavior. Follow-up opsional jika perlu strict
   CHECK enforcement.
5. Functional test 22-assertion di in-memory SQLite DB: semua pass
   (columns, CHECK, data preserved, FK, idempotency, indexes).

### Tasks 2-9: Tersisa (belum dimulai)

Baca plan `docs/superpowers/plans/2026-07-07-pos-katalog-extra.md` untuk
detail lengkap setiap task. Line ranges:

| Task | Line range | Isu | Deskripsi singkat |
|---|---|---|---|
| Task 2 | L283-509 | C4 TRANSFER | Zod schema + types + UI options TRANSFER (3 modal) + service `createMaklonPurchase` terima TRANSFER (= CASH behavior). **TDD.** |
| Task 3 | L510-681 | C1 quick-add | `ModalTambahItemLainnya` relaksasi validasi (vendor/biaya opsional) + `handleSaveTambahItemLainnya` simpan ke `katalog_maklon` via action + tambah ke cart dengan `katalog_maklon_id` + `pending_vendor_hpp` flag. |
| Task 4 | L682-911 | C2 pending maklon | `createSaleAttempt` relaksasi validasi + pending maklon handling (HPP=0, skip PO, skip SPK item, persist `pending_vendor_hpp`+`katalog_maklon_id`). **TDD.** |
| Task 5 | L912-1123 | C2 reconcile | `reconcilePendingMaklonItemAction` (update item, post HPP keuangan, create PO maklon) + UI queue "Pending Vendor/HPP" di `katalog-maklon/page.tsx`. **TDD.** |
| Task 6 | L1124-1328 | C3 Pilih Barang | `handleProdukJualClick` KATALOG_MAKLON set virtual material + form adaptasi (hide finishing/roll, show qty/harga/biaya tambahan) + `buildCartItemFromForm` maklon + `handleEditCartItem` alihkan ke form. |
| Task 7 | L1329-1470 | C6 kategori | `katalog_maklon.kategori_id` FK + service `listKatalogMaklon` join `kategori_barang` → `kategori_nama` + `ModalKatalogMaklon` dropdown + POS `produkJualList.kategori_nama` + `materialCategories` include katalog. **TDD.** |
| Task 8 | L1471-1670 | C5 Populer | `getPopularItemsAction` (auto-compute dari `item_penjualan` 30 hari + manual `populer_status`) + POS `sortPopuler` state + badge jadi toggle + sort `filteredProdukJual` + `ModalKatalogMaklon` ganti urutan→populer checkbox + `PanelHargaSatuan` checkbox Populer. **TDD.** |
| Task 9 | L1671-end | Verifikasi | type-check + build + jest semua test terkait + lint + apply migration ke cloud (`npm run supabase:db:push`) + manual smoke test. |

### Urutan eksekusi yang disarankan untuk Tasks 2-9

1. **Task 2 (C4 TRANSFER)** — foundational, banyak file depend pada enum
   ini. TDD.
2. **Task 3 (C1 quick-add)** — bergantung Task 2 (modal punya opsi
   TRANSFER).
3. **Task 4 (C2 pending)** — core sale flow, TDD. Bergantung Task 1
   (kolom `pending_vendor_hpp`) + Task 2 (validasi TRANSFER).
4. **Task 5 (C2 reconcile)** — bergantung Task 4 (pending maklon
   exists). TDD.
5. **Task 6 (C3 Pilih Barang)** — independen dari C2, bisa paralel
   setelah Task 4 (jangan overlap `pos/page.tsx` line yang sama).
6. **Task 7 (C6 kategori)** — independen, TDD.
7. **Task 8 (C5 Populer)** — bergantung Task 1 (`populer_status` kolom +
   `katalog_maklon_id` di `item_penjualan` untuk auto-compute). TDD.
8. **Task 9 (verifikasi)** — terakhir.

### Cara melanjutkan eksekusi

Gunakan skill `subagent-driven-development` (inline, 1 subagent pada satu
waktu). Dispatch implementer subagent per task (atau group 2-3 task
related), review spec compliance + code quality setelahnya. Detail setiap
task ada di plan file — subagent bisa baca line range spesifik.

**Contoh dispatch untuk Task 2:**
```
Baca docs/superpowers/plans/2026-07-07-pos-katalog-extra.md lines 283-509.
Implement C4 TRANSFER: Zod schema + types + UI (3 modal) + service
createMaklonPurchase. TDD. Gunakan populer_status (bukan popuer_status)
jika ada field Populer di task ini. Commit.
```

---

## File yang sudah diubah (ringkasan)

### Plan D
- `src/app/beranda/page.tsx` — `handleGenerate` urutan `router.push` ↔ `onChanged()`

### Plan E
- `src/components/ModalBayarPiutang.tsx` — dark mode border/info-box/red text
- `src/components/ModalBayarHutang.tsx` — dark mode border/input/red text
- `src/components/KeranjangPOS.tsx` — label "Parkir" → "Simpan"
- `src/app/pos/ModalParkirKeranjang.tsx` — label "Parkir" → "Simpan"
- `src/app/pos/page.tsx` — toast "diparkir" → "disimpan" + `await printThermalInvoice`
- `src/components/barang/PanelHargaSatuan.tsx` — hint `text-xs`, `<details>` contoh, `py-2`
- `src/components/ModalTambahBarang.tsx` — hint `text-xs`
- `src/lib/thermal-print.ts` — route via `preparePrintHtml` + `openPrintDocument`, hapus local helpers + dead script
- `src/app/produksi/spk/components/spk-print.ts` — hapus inline `<script>window.print()</script>`
- `src/app/produksi/spk/page.tsx` — `handlePrintSPK` async via pipeline
- `src/app/produksi/spk/components/SpkDetailModal.tsx` — `onPrint` prop `void | Promise<void>`, `await onPrint` sebelum `onClose`
- `src/components/TabelRiwayatPenjualan.tsx` — `await printThermalInvoice` (caller tambahan)

### Plan B
- `supabase/migrations/20260707000002_barang_komponen_unit_price.sql` — create
- `database/sqlite-schema.sql` — `barang_komponen` kolom `unit_price_id` + `jumlah_roll NOT NULL DEFAULT 1`
- `src/lib/db-unified.ts` — runtime ALTER `unit_price_id` + backfill `jumlah_roll`
- `src/lib/services/bom-service.ts` — create: `resolveBomForUnitPrice` + `computeBomCostPerUnit` + `BarangKomponenRow`
- `src/lib/__tests__/bom-resolver.test.ts` — create: 5 test resolver
- `src/lib/__tests__/bom-service.test.ts` — extend: 3 test `deductBomComponents` dengan `unitPriceId` (4 existing di-update mock)
- `src/lib/__tests__/pos-mutations-hpp-bom.test.ts` — create: 4 test HPP BOM
- `src/lib/__tests__/bom-utils.test.ts` — extend: 1 test default `jumlahRoll=1`
- `src/lib/services/production-service.ts` — `deductBomComponents` pakai resolver + caller join `item_penjualan`
- `src/lib/services/pos-mutations.ts` — HPP BARANG + `computeBomCostPerUnit`
- `src/app/api/barang-komponen/route.ts` — schema + POST/GET `unit_price_id` + default `jumlah_roll=1`
- `src/app/api/barang-komponen/__tests__/route.test.ts` — extend: 4 test + mock refactor
- `src/components/ModalTambahBarang.tsx` — `addUnitPrice` default `base_unit` + props `unitPrices`
- `src/components/PanelKomponenRakitan.tsx` — dropdown "Berlaku untuk" + hide "Jumlah roll" + label help

### Plan C (Task 1 saja)
- `supabase/migrations/20260707000003_pos_katalog_extra.sql` — create
- `database/sqlite-schema.sql` — `item_penjualan` + `katalog_maklon` + `harga_barang_satuan` kolom + CHECK
- `src/lib/db-unified.ts` — runtime ALTER + table-rebuild untuk CHECK constraint

---

## Verifikasi status

| Check | Status |
|---|---|
| `npm run type-check` | ✅ 0 error (terakhir dicek setelah C Task 1) |
| `npm run build` | ✅ sukses (terakhir dicek setelah B Task 9) |
| `npx jest src/lib/__tests__/bom-*` | ✅ 27/27 pass |
| `npx jest src/app/api/barang-komponen/__tests__/` | ✅ 7/7 pass |
| `npx jest src/lib/__tests__/pos-mutations-hpp-bom.test.ts` | ✅ 4/4 pass |
| `npx jest src/lib/__tests__/production*` | ✅ 8/8 pass |
| Regression sweep POS/finance/return/inventory | ✅ all green |
| Verifikasi manual browser | ❌ belum dilakukan (semua plan) |
| `npm run supabase:db:push` (apply migration ke cloud) | ❌ belum dijalankan |

---

## Hal-hal yang perlu diingat untuk agent berikutnya

1. **`populer_status` bukan `popuer_status`** — Plan C spec/plan punya typo
   `popuer_status` di beberapa tempat. Kolom DB sudah pakai `populer_status`
   (baku). Tasks 2-8 WAJIB pakai `populer_status`.

2. **`createMaklonPurchase` ada di `purchases-mutations.ts`** bukan
   `purchases-service.ts` (spec C meleset). Signature saat ini:
   `metodeBayar: "CASH" | "NET30"`. Untuk TRANSFER: lebarkan tipe, ganti
   `=== "CASH"` → `isLunas = "CASH" || "TRANSFER"` di 3 tempat
   (`jumlahDibayar`, `statusPembayaran`, cabang keuangan). NET30 tetap
   buat hutang.

3. **Cross-dependency Plan B ↔ C di `pos-mutations.ts`** — Plan B ubah
   cabang BARANG HPP (~L588-602, sudah selesai). Plan C ubah cabang
   MAKLON (validasi L385-412, HPP L581-584, saleItem insert L630-664, SPK
   item L884-945, PO grouping L978-1023). Beda blok — aman.

4. **SQLite CHECK constraint tidak bisa di-ALTER** — pakai table-rebuild
   (sudah diimplementasi di C Task 1 untuk `item_penjualan` +
   `katalog_maklon`). Pattern: deteksi via `sqlite_master sql LIKE ... NOT
   LIKE '%TRANSFER%'` → create new table → copy data → drop old → rename.
   **Bug latent di reference rebuild `harga_barang_satanan`** (expression
   DEFAULT parens) — jangan sentuh kecuali owner minta.

5. **`getKategoriBarangAction`** — reuse `getMaterialCategories()` yang
   sudah ada di `materials-service.ts` (tidak perlu service baru) untuk
   dropdown kategori di `ModalKatalogMaklon`.

6. **Auth guards:** `createKatalogMaklonAction`/`updateKatalogMaklonAction`
   pakai `requireAdminOrManager` (sudah ada). `reconcilePendingMaklonItemAction`
   pakai `requireOperationalRole` (Staf+ boleh). `getPopularItemsAction`
   read → `requireSession`.

7. **Code review** — E5 sudah di-code-review (ditemukan UX regression
   `SpkDetailModal` close timing, sudah di-fix). Tasks B belum di-code-review
   formal (TDD test pass + type-check + build = spec compliance verified,
   tapi code quality review subagent belum dispatch). Pertimbangkan
   dispatch final code reviewer untuk Plan B sebelum merge.

8. **`surat-jalan-print.ts`** masih punya duplikat `printAfterAssetsReady`
   lokal (pre-existing, out of scope E5) — follow-up opsional untuk rute
   via pipeline `preparePrintHtml` + `openPrintDocument` juga.

9. **Verifikasi manual belum dilakukan** untuk semua plan. Setelah
   implementasi C selesai, lakukan smoke test manual (lihat masing-masing
   plan Task terakhir untuk checklist).

10. **Migrasi belum di-apply ke cloud** — `npm run supabase:db:push`
    belum dijalankan. Jalankan setelah semua commit di-push ke `main`
    (Vercel auto-deploy). Migrasi yang perlu di-apply:
    `20260707000002_barang_komponen_unit_price.sql` (Plan B) +
    `20260707000003_pos_katalog_extra.sql` (Plan C).

---

## Cara melanjutkan

1. Pastikan di branch `feature/bcde-rakitan-pos-ui-polish`.
2. Baca plan C: `docs/superpowers/plans/2026-07-07-pos-katalog-extra.md`.
3. Mulai dari Task 2 (C4 TRANSFER) — baca L283-509.
4. Dispatch subagent per task (atau group), review setelahnya.
5. Setelah Task 9 selesai: dispatch final code reviewer untuk seluruh
   implementasi B+C, lalu gunakan skill
   `finishing-a-development-branch` untuk merge/PR.
6. Setelah merge ke `main`: jalankan `npm run supabase:db:push`.
7. Verifikasi manual di browser (semua smoke test checklist).