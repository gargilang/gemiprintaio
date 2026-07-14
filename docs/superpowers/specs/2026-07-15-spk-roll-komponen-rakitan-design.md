# SPK — Dukungan Roll untuk Komponen Rakitan Berdimensi

**Tanggal:** 2026-07-15
**Status:** Disetujui (langsung ke writing-plans, tanpa gate review per instruksi owner)
**Cakupan:** Produksi/SPK + inventaris roll untuk komponen BOM berdimensi. Menyentuh stok/roll/AVCO/HPP (aturan besi #2, #3, #6, #7, #9).

## Masalah

Fitur "produk rakitan": user membuat barang biasa non-dimensi (mis. "Kaki Roll Banner", `butuh_dimensi_status = 0`), lalu membuat produk jual (mis. "X Banner") yang dirakit dengan komponen barang **berdimensi** (mis. "Flexi 280 gsm", `butuh_dimensi_status = 1`) via tabel `barang_komponen` (BOM).

Ketika "X Banner" dijual, SPK **tidak** memunculkan keterangan roll mana yang dipakai untuk mencetak komponen Flexi 280, dan stok Flexi 280 dipotong dengan cara m² polos (`PRODUCTION_ISSUE` tanpa roll variant), **bukan** roll-width-aligned seperti barang berdimensi murni.

Akar masalah: seluruh mesin roll (rekomendasi lebar roll, konfirmasi roll aktual, pemotongan roll-aligned, AVCO) di-anchor ke `item_penjualan.barang_id` / barang **induk** yang dijual. Komponen berdimensi hanya hidup di `barang_komponen` (dipakai untuk hitung HPP via `computeBomCostPerUnit`) dan tidak pernah dibawa ke jalur roll/SPK sebagai unit ber-roll.

Referensi investigasi: komponen tidak pernah menjadi baris `item_produksi` ber-roll (`pos-mutations.ts` createProductionOrder inline), roll variants diresolve dari `saleItem.barang_id` induk (`production-service.ts:resolveProductionConsumptionContext`), dan `deductBomComponents` (`production-service.ts:1008-1066`) memotong m² polos tanpa `roll_variant_id`/`roll_width_m`/`linear_delta_m`.

## Tujuan

- Komponen **berdimensi** dalam produk rakitan mendapat perlakuan roll penuh di SPK: rekomendasi roll, konfirmasi roll variant + panjang aktual oleh operator, pemotongan stok roll-width-aligned, dan HPP AVCO yang akurat.
- Ukuran cetak komponen berasal dari setup rakitan (`barang_komponen.panjang/lebar/jumlah_roll`), tapi **roll variant** yang dipakai tetap dipilih operator saat konfirmasi (karena bergantung stok roll tersedia).
- Ditampilkan sebagai **sub-baris** di bawah item induk di SPK (web + cetak).
- Berlaku hanya untuk penjualan **baru**; data/SPK rakitan yang sudah ada tidak diubah.

## Non-Tujuan

- Tidak mengubah alur barang berdimensi murni (yang sudah bekerja).
- Tidak memigrasi SPK rakitan yang sudah berjalan ke jalur roll baru.
- Tidak menerapkan roll ke komponen non-dimensi (tetap dipotong m² polos / qty biasa seperti sekarang).
- Tidak mengubah UI setup rakitan di Data Barang (BOM sudah menyimpan panjang/lebar/jumlah_roll).

## Keputusan Desain (hasil brainstorming)

| Topik | Keputusan |
| --- | --- |
| Cakupan komponen | Hanya komponen berdimensi (`butuh_dimensi_status = 1` + panjang/lebar di BOM) |
| Alur konfirmasi | Operator wajib konfirmasi roll variant + panjang aktual (seperti berdimensi murni) |
| Tampilan SPK | Sub-baris di bawah item induk |
| Data lama | Hanya penjualan baru |
| Timing potong stok | Ditahan saat jual, dipotong roll-aligned saat konfirmasi |
| Sumber ukuran cetak | Dari BOM (`barang_komponen`), fix |
| Roll variant | Dipilih operator saat konfirmasi |
| HPP | AVCO per m² barang komponen × luas roll-aligned terpakai (otomatis via inventory-service) |
| Pendekatan | Opsi A: baris `item_produksi` anak per komponen berdimensi |

## Arsitektur

### Model data (migrasi DB — aturan besi #2, tiga tempat sinkron)

Tambah kolom ke `item_produksi`:
- `parent_item_produksi_id TEXT` (nullable, FK ke `item_produksi.id`) — menandai baris komponen dari item induk. `NULL` = baris normal/induk (perilaku lama tak berubah).

`barang_id` pada baris anak = `komponen_id` (barang komponen berdimensi), sehingga mesin roll yang membaca `barang_id` langsung bekerja. Tidak perlu kolom `komponen_barang_id` terpisah.

Tiga tempat sinkron:
1. `supabase/migrations/20260715120000_item_produksi_komponen_rakitan.sql` — additive, `ADD COLUMN IF NOT EXISTS`.
2. `database/sqlite-schema.sql` — kolom di definisi `CREATE TABLE item_produksi`.
3. Runtime `ALTER TABLE item_produksi ADD COLUMN parent_item_produksi_id TEXT` di `src/lib/db-unified.ts` (guard `!cols.includes(...)`).

Registrasi sync: `item_produksi` sudah tabel tersinkron; kolom baru ikut karena sinkron kolom-agnostik (verifikasi tidak perlu perubahan `sync-config.ts` untuk penambahan kolom pada tabel yang sudah terdaftar).

### Pembuatan baris anak saat checkout (`src/lib/services/pos-mutations.ts`)

Dalam loop pembuatan `item_produksi` (setelah insert item induk), untuk item `tipe_item = BARANG`:
1. Resolve BOM: `resolveBomForUnitPrice(item.barang_id, item.harga_satuan_id)` (sudah ada).
2. Untuk tiap komponen yang berdimensi (barang komponen `butuh_dimensi_status = 1` DAN `panjang`/`lebar` terisi di BOM):
   - Buat baris `item_produksi` anak dengan:
     - `id` deterministik: `${itemProdIndukId}-komp-${komponen.id}` (aturan besi #9).
     - `parent_item_produksi_id` = id induk.
     - `item_penjualan_id` = sama dengan induk.
     - `barang_id` = `komponen.komponen_id`.
     - `barang_nama` = nama barang komponen.
     - `jumlah` (m²) = `hitungQtyKomponenDimensiM2(komponen.jumlah_roll, komponen.panjang, komponen.lebar) × qtySPK`.
     - `panjang`/`lebar` = dari BOM; `jumlah_roll` = `komponen.jumlah_roll × qtySPK` (integer).
     - `recommended_roll_width_m` = `suggestSmallestCoveringRollSize(panjang, lebar, rollSizesKomponen)` atau util roll yang setara berdasarkan variants komponen.
     - `roll_inventory_status = "PENDING"`.
     - `status = "MENUNGGU"`.
3. Komponen non-dimensi: TIDAK dibuatkan baris anak (tetap dipotong lewat `deductBomComponents` saat SELESAI).
4. Maklon (`tipe_item = MAKLON`): TIDAK diproses (tidak punya BOM berdimensi).

Penahanan stok: komponen berdimensi tidak dipotong saat checkout. `deductBomComponents` diubah untuk skip komponen berdimensi (lihat bagian konsumsi), sehingga pemotongannya hanya terjadi lewat konfirmasi roll.

### Query & tampilan SPK (`src/lib/services/production-service.ts` + UI)

- `getProductionOrders` / `getProductionOrderById`: baris dengan `parent_item_produksi_id != null` dikelompokkan sebagai anak, tidak tampil top-level. Perluas tipe `ProductionOrderItem` dengan `komponen_roll?: ProductionOrderItem[]` (default `[]`). Tiap baris anak membawa `recommended_roll_width_m`, `roll_inventory_status`, `panjang`, `lebar`, `barang_id`, `barang_nama`, `jumlah`.
- `SpkDetailModal.tsx`: di bawah item induk rakitan, render tiap baris anak berdimensi sebagai sub-baris dengan blok konfirmasi roll (dropdown roll variant + input panjang aktual) yang menargetkan `item_produksi_id` = baris anak. Komponen non-dimensi tetap tampil sebagai teks biasa (`Komponen: ...`).
- `spk-print.ts`: cetak sub-baris komponen berdimensi dengan nama + ukuran cetak + roll rekomendasi/terkonfirmasi, format konsisten dengan roll berdimensi murni.

### Konfirmasi roll, pemotongan stok, HPP (`src/lib/services/production-service.ts`)

- `resolveProductionConsumptionContext`: bila `item.parent_item_produksi_id != null`, resolusi `material` + roll variants + dimensi diambil dari `item.barang_id` (komponen) dan `item.panjang/lebar` (BOM), bukan dari `saleItem`.
- `postProductionMaterialConsumption`:
  - Guard kelayakan: untuk baris anak, syaratnya `item.roll_inventory_status === "PENDING"` (baris anak tidak punya `saleItem` berdimensi). Untuk baris murni, tetap cek `saleItem.roll_inventory_deferred`.
  - Roll variants diambil dari `barang_id` konteks (komponen untuk baris anak).
  - Pemotongan: `postInventoryMovement` roll-aligned (`roll_variant_id`, `roll_width_m`, `linear_delta_m`, `qty_delta` negatif). ID movement `mov-${consumptionId}` (deterministik).
  - HPP: dihitung otomatis oleh inventory-service (AVCO per m² komponen × luas terpakai).
- Sinkronisasi HPP ke `item_penjualan`: karena induk & komponen berbagi satu `item_penjualan`, akumulasi HPP komponen ke `hpp_total`/`gross_profit`/`gross_margin` item penjualan induk setelah konfirmasi (mengganti estimasi BOM awal dengan aktual roll). Hitung ulang deterministik dari movement komponen.
- `deductBomComponents`: skip komponen berdimensi (`if (butuh_dimensi && panjang && lebar) continue;`) untuk mencegah pemotongan ganda. Komponen non-dimensi tetap m² polos.
- Guard SELESAI: item induk tidak bisa SELESAI sebelum semua baris anak berdimensi dikonfirmasi (`roll_inventory_status` PENDING → POSTED). Error ramah bila dilanggar.
- Closed-period guard (aturan besi #7): konfirmasi roll membuat movement bertanggal → cek `isDateInClosedPeriod` (ikuti pola konsumsi berdimensi murni).
- Void penjualan: movement roll komponen punya `source_id`/`source_line_id` → mekanisme void yang ada menjangkaunya. Diverifikasi saat implementasi.

## Aturan Proyek yang Dipatuhi

- #2 Schema change tiga tempat sinkron (Supabase migration + sqlite-schema + runtime ALTER).
- #3 Inventory mutation lewat `postInventoryMovement` (roll-aligned), bukan raw update.
- #6 Roll/dimensional: `jumlah` m² = jumlah_roll × panjang × lebar; roll-width-aligned; input Lebar × Panjang.
- #7 Closed-period guard pada mutasi bertanggal.
- #9 ID ledger/baris idempoten & deterministik dari source row.
- #10 Verifikasi: type-check → build → jest untuk service tersentuh.

## Verifikasi & Testing

- `npm run type-check` (0 error) → `npm run build`.
- Jest (project node):
  - `createSale` rakitan → baris anak `item_produksi` dibuat untuk komponen berdimensi; stok komponen TIDAK dipotong saat checkout; komponen non-dimensi tidak dibuatkan baris anak.
  - `postProductionMaterialConsumption` baris anak → stok komponen dipotong roll-aligned; `hpp_total` item penjualan induk disinkron.
  - `deductBomComponents` → skip komponen berdimensi (tidak dobel potong), komponen non-dimensi tetap terpotong.
  - Guard SELESAI sebelum konfirmasi → error ramah.
- Manual: jual "X Banner" (rakitan dengan komponen Flexi 280 berdimensi) → SPK menampilkan sub-baris Flexi 280 dengan rekomendasi + konfirmasi roll; konfirmasi memotong stok roll-aligned; cetak SPK memuat info roll.

## Risiko & Mitigasi

- **Pemotongan ganda stok komponen.** Mitigasi: `deductBomComponents` skip komponen berdimensi; test khusus.
- **HPP tidak sinkron ke item penjualan.** Mitigasi: hitung ulang `hpp_total` induk dari movement komponen setelah konfirmasi; test.
- **Kompatibilitas data lama.** Mitigasi: `parent_item_produksi_id` nullable; baris tanpa nilai = perilaku lama. Hanya penjualan baru yang membuat baris anak.
- **Void/pembatalan.** Mitigasi: verifikasi mekanisme void menjangkau movement komponen via `source_id`/`source_line_id`.

## Yang TIDAK Berubah

Alur barang berdimensi murni, alur maklon (termasuk fix isu #1), UI setup rakitan di Data Barang, komponen non-dimensi, penjualan/SPK rakitan yang sudah ada.
