# Progres Seragam Bahasa

Dokumen ini dipakai sebagai handoff untuk agen berikutnya. Setiap fase normalisasi bahasa harus memperbarui bagian progres, keputusan, dan sisa pekerjaan.

## Status umum

- Standar bahasa final: **Indonesia-first untuk semua artefak milik aplikasi**.
- UI harus selalu Bahasa Indonesia.
- English hanya boleh untuk framework/library/protokol, generated/vendor code, tipe bawaan, package, SQL keywords, fixed framework filenames, dan migrasi lama yang sudah applied.
- Database/API deployed harus dimigrasi bertahap dengan alias kompatibilitas.

## Fase 0 - Pondasi aturan dan audit

Status: **selesai pada 2026-05-27**.

Yang sudah dilakukan:

- `.cursorrules` diperbarui agar aturan lama "comments English-only" diganti menjadi standar Indonesia-first.
- `docs/agent-playbook.md` diberi bagian "Standar bahasa aplikasi" sebagai iron rule baru.
- `docs/panduan-bahasa.md` dibuat sebagai glossary dan checklist bahasa.
- `scripts/audit-bahasa.mjs` ditambahkan sebagai audit read-only.
- `package.json` diberi script `audit:bahasa`.

Keputusan penting:

- Istilah "Vendor", "POS", "PPN", "NPWP", "NSFP", "SPK", "maklon", dan "finishing" boleh dipakai karena sudah umum di konteks operasional Indonesia.
- "Purchase Order" distandarkan menjadi "Pesanan Pembelian" untuk UI dan domain baru.
- Komentar/JSDoc baru application-owned harus Bahasa Indonesia.

Cara audit:

```bash
npm run audit:bahasa
```

Audit ini hanya melaporkan kandidat masalah dan tidak menggagalkan command. Untuk CI atau gate ketat:

```bash
npm run audit:bahasa -- --fail-on-findings
```

## Fase 1 - UI terlihat pengguna

Status: **selesai pada 2026-05-27 setelah dua batch lanjutan oleh agen kedua**.

Target fase:

- Terjemahkan UI web dan Flutter yang masih English.
- Prioritas: menu/breadcrumb, halaman utama, modal, toast, empty/loading/error state, print/PDF, report columns.
- Jangan rename route/API/database dulu kecuali hanya label UI.

Yang sudah dilakukan:

- Menu dan title aplikasi diseragamkan:
  - `Dashboard` -> `Beranda`
  - `AI Prompt` -> `Prompt AI`
  - `Purchase Order` -> `Pesanan Pembelian`
  - `Stock Adjustment` -> `Penyesuaian Stok`
  - `Stock Opname` -> `Opname Stok`
  - `Movement Ledger` -> `Riwayat Mutasi Stok`
  - `Manajemen User` -> `Manajemen Pengguna`
- Shell web dan shell Flutter mulai diseragamkan:
  - fallback title `Dashboard` -> `Beranda`
  - tombol/tooltip `Logout` -> `Keluar`
  - route dashboard Flutter memakai label `Beranda`
- Halaman Pesanan Pembelian mulai diseragamkan:
  - judul cetak `PURCHASE ORDER` -> `PESANAN PEMBELIAN`
  - tombol `Print`, `Mark Sent`, `Receive` -> `Cetak`, `Tandai Terkirim`, `Terima`
  - pesan toast dan fallback error `PO` -> `pesanan pembelian`
  - label kuantitas `PO` -> `Dipesan`
- Halaman laporan dan cetak laporan mulai diseragamkan:
  - `Print / Save PDF` -> `Cetak / Simpan PDF`
  - `Opening Print Window...` -> `Membuka Jendela Cetak...`
  - `Preview & Generate` -> `Pratinjau dan Cetak`
  - `Customer` -> `Pelanggan`
  - error API laporan keuangan diterjemahkan ke Bahasa Indonesia.
- Halaman finance mulai diseragamkan:
  - tooltip edit/hapus dan state `Read-only` diterjemahkan.
  - loading state `Loading...` -> `Memuat...`.
  - tombol `Delete All` -> `Hapus Semua`.
- Halaman settings mulai diseragamkan:
  - tab `Pricing` -> `Harga`
  - `Pricing Settings` -> `Pengaturan Harga`
  - loading state, tema `Light/Dark`, dan daftar fitur mendatang mulai diterjemahkan.
- Halaman inventori mulai diseragamkan:
  - title `Stock Adjustment`, `Movement Ledger`, `Stock Opname` diterjemahkan.
  - `Export CSV` pada movement ledger diterjemahkan menjadi `Ekspor CSV`.
- Halaman dashboard footer dan widget reorder mulai diseragamkan:
  - footer `All-in-One Management System` -> `Sistem Manajemen Terpadu`
  - tombol `Generate Semua` -> `Buat Semua`, `Generating...` -> `Membuat...`
  - tombol `Generate Draft` -> `Buat Draf`
  - error fallback `draft PO` -> `draf pesanan pembelian`
  - dashboard recent sales fallback `Walk-in` -> `Pelanggan Umum`
- Modul cetak laporan keuangan diseragamkan:
  - tagline `Professional Printing Services` -> `Layanan Percetakan Profesional`
  - tombol error `Tutup Window` -> `Tutup Jendela`
  - komentar HTML cetak/tutup dan Match colors diterjemahkan
- Modul Penawaran:
  - opsi pelanggan `Walk-in customer` -> `Pelanggan Umum`, HTML cetak ikut diseragamkan
  - kolom tabel `Walk-in` -> `Umum`
- Modul POS dan Riwayat Penjualan:
  - placeholder `Cari pelanggan atau ketik nama walk-in...` -> `Cari pelanggan atau ketik nama pelanggan umum...`
  - badge tabel `Walk-in` -> `Umum`
  - keperluan kasbook `- Walk-in` -> `- Pelanggan Umum`
  - judul konfirmasi pembatalan piutang fallback `Walk-in` -> `Pelanggan Umum`
  - tooltip `Preview faktur (floating window)` -> `Pratinjau faktur (jendela mengambang)`
  - tooltip `Preview faktur pembelian (floating window)` -> `Pratinjau faktur pembelian (jendela mengambang)`
  - tooltip `Preview penawaran harga` -> `Pratinjau penawaran harga`
  - tooltip `Preview surat jalan` -> `Pratinjau surat jalan`
  - judul jendela mengambang `Preview Faktur` -> `Pratinjau Faktur`
- Halaman SPK Produksi:
  - HTML cetak fallback `Walk-in` -> `Pelanggan Umum`
  - tabel dan detail SPK fallback `Walk-in` -> `Pelanggan Umum`
- Modul service laporan:
  - `reports-service.ts` fallback nama pelanggan `Walk-in` -> `Pelanggan Umum`
- Modal kecil dan komponen:
  - `EditManualModal`: judul `Edit Manual (Override)` -> `Edit Manual (Penggantian)`, info box dan tooltip ikut diseragamkan, komentar Inggris di file diterjemahkan
  - `MaklonLineModal`: `Total tagih ke customer` -> `Total tagih ke pelanggan`
  - `LaporanPpnPanel`: `Export CSV` -> `Ekspor CSV`
  - `AddMaterialModal`: badge `Default` -> `Utama`
  - `ImportCsvModal`: judul modal `Import dari CSV` -> `Impor dari CSV`
- Modul pengaturan dan PPN:
  - tab pengaturan tombol `Reset Default` -> `Kembali ke Bawaan`
  - badge printer `Default` -> `Bawaan`
  - tombol `Import Range` -> `Impor Rentang`
  - empty state `Belum ada NSFP. Import range dari Coretax dulu.` -> `Belum ada NSFP. Impor rentang dari Coretax dulu.`
  - error `Tidak ada NSFP tersedia. Import dulu dari Coretax di Settings → PPN.` -> `... di Pengaturan → PPN.`
  - kalimat upload NSFP: `Upload range NSFP ... App akan ...` -> `Unggah rentang NSFP ... Aplikasi akan ...`
  - label `Toggle "kena PPN" ON ...` -> `Aktifkan "kena PPN" otomatis ...`
  - title tombol `Delete` di tab printer/material -> `Hapus`
  - tombol toolbar `Import CSV` -> `Impor CSV`
- Halaman Manajemen Pengguna:
  - opsi role di form: `User` -> `Pengguna`, `Staff` -> `Staf`, `Manager` -> `Manajer`
- Halaman Inventory Movements:
  - tombol toolbar `Refresh` -> `Muat Ulang`
- Standardisasi `Invoice` -> `Faktur` di seluruh UI dan template cetak (batch ketiga):
  - judul cetak `<title>Invoice - ...</title>` -> `<title>Faktur - ...</title>` (`thermal-print.ts`, `faktur-print.ts`)
  - judul thermal print `INVOICE PENJUALAN` -> `FAKTUR PENJUALAN`
  - label thermal/faktur cetak `No. Invoice` -> `No. Faktur`
  - header tabel `Invoice` -> `Faktur` di SuratJalanTable, SalesHistoryTable, LaporanPpnPanel, sales-returns/page
  - kolom report di reports/page.tsx (`Invoice` MetricCard, FormalTable column)
  - label SPK Produksi: `Invoice` thead, info row HTML cetak, detail
  - label PayReceivableModal: `Invoice:` -> `Faktur:`
  - placeholder pencarian: `Cari nomor SJ, penerima, atau ref invoice...` -> `... ref faktur...`
  - placeholder pencarian SPK dan SalesHistory: `Invoice` -> `Faktur`
  - toast POS `Transaksi berhasil! Invoice: ...` -> `Transaksi berhasil! Faktur: ...`
  - toast/error `Pilih invoice` di sales-returns -> `Pilih faktur`
  - judul setting `Faktur Penjualan (Invoice)` -> `Faktur Penjualan`
  - label settings tab `Template Invoice` -> `Template Faktur`
  - label penawaran HTML cetak/footer/header `... ke invoice` -> `... ke faktur`, `Total invoice` -> `Total faktur`, `Tanggal invoice` -> `Tanggal faktur`
  - dialog konfirmasi vendor `... 30 hari setelah invoice` -> `... setelah faktur`
- Pembersihan `Draft` -> `Draf` (UI display, bukan enum value):
  - dropdown opsi penawaran: label `DRAFT` -> `Draf`, `SENT` -> `Terkirim`
  - status badge surat jalan: tampilan `DRAFT` -> `DRAF`
  - error/dialog: `Hanya ... berstatus DRAFT yang ...` -> `... DRAF yang ...`
  - subtitle PO: `Draft, kirim, ...` -> `Draf, kirim, ...`
- Pembersihan istilah teknis lain di error/toast service:
  - `Alasan adjustment stok wajib diisi` -> `Alasan penyesuaian stok wajib diisi`
  - `Alasan/keterangan material rusak wajib diisi` -> `... barang rusak wajib diisi`
  - `Jumlah material rusak harus lebih dari 0` -> `Jumlah barang rusak harus lebih dari 0`
  - tooltip `Catat material rusak / scrap` -> `Catat barang rusak / scrap`
  - audit log `Material rusak: ...` -> `Barang rusak: ...`
  - PO service: `PO tidak ditemukan` -> `Pesanan pembelian tidak ditemukan`, `Item PO ... tidak ditemukan` -> `Item pesanan pembelian ... tidak ditemukan`, `... melebihi sisa PO` -> `... melebihi sisa pesanan pembelian`
  - Stock opname service: `Stock opname tidak ditemukan` -> `Opname stok tidak ditemukan`
  - NSFP service: `Range NSFP tidak valid` -> `Rentang NSFP tidak valid`
  - dashboard widget: fallback `Buat PO manual` -> `Buat pesanan pembelian manual`
- Pembersihan UI lain:
  - Manajemen Pengguna: `Total Users` -> `Total Pengguna`
  - ExpressionAssistant: tombol `Reset ke default` -> `Kembali ke Bawaan`
  - FloatingFakturPreview: aria-label `Tutup preview faktur` -> `Tutup pratinjau faktur`
  - DeleteAllCashbookModal: `Data Invoice` -> `Data Faktur`

File utama yang sudah tersentuh pada Fase 1:

- `flutter/lib/widgets/app_shell.dart`
- `src/components/menuConfig.tsx`
- `src/components/MainShell.tsx`
- `src/components/FloatingFakturPreview.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/actions.ts`
- `src/app/purchase-orders/page.tsx`
- `src/app/reports/page.tsx`
- `src/app/reports/print/page.tsx`
- `src/app/reports/financial/print/page.tsx`
- `src/app/api/reports/financial/route.ts`
- `src/lib/services/reports-service.ts`
- `src/lib/services/pos-service.ts`
- `src/app/finance/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/settings/PpnTab.tsx`
- `src/app/inventory/adjustments/page.tsx`
- `src/app/inventory/movements/page.tsx`
- `src/app/inventory/opname/page.tsx`
- `src/app/production/ai-prompt/page.tsx`
- `src/app/production/spk/page.tsx`
- `src/app/penawaran/page.tsx`
- `src/app/aktivitas/page.tsx`
- `src/app/materials/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/app/users/page.tsx`
- `src/app/pos/page.tsx`
- `src/components/AddFinishingModal.tsx`
- `src/components/AddMaterialModal.tsx`
- `src/components/EditManualModal.tsx`
- `src/components/ImportCsvModal.tsx`
- `src/components/LaporanPpnPanel.tsx`
- `src/components/MaklonLineModal.tsx`
- `src/components/PayReceivableModal.tsx`
- `src/components/POSCart.tsx`
- `src/components/PpnFakturModal.tsx`
- `src/components/PurchaseTable.tsx`
- `src/components/SalesHistoryTable.tsx`
- `src/components/SuratJalanTable.tsx`
- `src/components/DeleteAllCashbookModal.tsx`
- `src/components/PpnFakturModal.tsx`
- `src/components/finance/ExpressionAssistant.tsx`
- `src/lib/thermal-print.ts`
- `src/lib/faktur-print.ts`
- `src/lib/services/inventory-service.ts`
- `src/lib/services/stock-opname-service.ts`
- `src/lib/services/purchase-order-service.ts`
- `src/lib/services/nsfp-service.ts`
- `src/lib/services/audit-log-service.ts`
- `src/lib/services/surat-jalan-service.ts`
- `src/lib/__tests__/stock-opname-service.test.ts`
- `src/app/sales-returns/page.tsx`
- `src/app/surat-jalan/page.tsx`
- `src/app/vendors/page.tsx`

Audit terakhir:

```bash
npm run audit:bahasa
```

Hasil setelah batch ketiga (Invoice -> Faktur, Draft -> Draf, dll): **1682 kandidat temuan**.

Tren audit:
- Baseline awal Fase 1: 1741 temuan
- Setelah batch Fase 1 awal: 1694 temuan (-47)
- Setelah batch lanjutan oleh agen kedua: 1683 temuan (-11)
- Setelah batch ketiga (Invoice/Draft cleanup): 1682 temuan (-1)

Catatan: angka audit hampir tidak turun karena sebagian besar temuan tersisa adalah komentar JSDoc Inggris dan identifier kode (`nomor_invoice`, dll) yang memang ditahan untuk Fase 2/3/5. Audit ini konservatif dan bisa false-positive.

Verifikasi yang dijalankan setelah batch ketiga (2026-05-27):

- `npm run type-check` -> **lulus, 0 error**
- `npm run build` -> **lulus, semua route tergenerasi**
- `npx jest src/lib/__tests__/stock-opname-service.test.ts` -> **lulus, 5 test (test pesan error sudah disesuaikan ke "DRAF")**
- `flutter analyze` -> tidak dijalankan ulang (file Flutter tidak disentuh di batch ini; terakhir lulus 2026-05-27)

Sisa pekerjaan Fase 1: **selesai untuk scope UI yang dilihat pengguna**. Sisa istilah Inggris yang tersisa adalah:

- Identifier kode (`nomor_invoice` field, `walkInFaktur` state, `materialFormDraft` cache key, dll) -> Fase 3.
- Komentar JSDoc Inggris di file yang sudah disentuh -> Fase 2.
- Komentar di scripts/, src-tauri/src/, layer service yang belum disentuh -> Fase 2.
- Migrasi cloud lama dengan kolom Inggris -> Fase 5 (lewat migrasi baru + alias kompatibilitas).
- Test description Inggris (mis. `it("rejects qty > sisa invoice", ...)`) boleh tetap, atau disisir di Fase 2.

## Fase 2 - Komentar, docs, dan prompt rules

Status: **selesai pada 2026-05-27 oleh agen kedua**.

Yang sudah dilakukan:

- Komentar/JSDoc Indonesia di service layer (`src/lib/services/`):
  - `pos-service.ts`, `purchases-service.ts`, `inventory-service.ts`, `finance-service.ts`
  - `production-service.ts`, `customers-service.ts`, `finishing-options-service.ts`
  - `auto-po-service.ts`, `cashbook-formula-service.ts`, `formula-service.ts`
  - `business-actor-service.ts`, `transaction-computed-service.ts`, `finance-config-service.ts`
  - `purchase-order-service.ts`, `nsfp-service.ts`, `credentials-service.ts`
- Komentar/JSDoc Indonesia di komponen (`src/components/`):
  - `AddMaterialModal`, `PurchaseForm`, `PurchaseTable`
  - `ExpressionAssistant` (top-level + inline penting)
  - `MaklonLineModal`, `EditPriceModal`, `SuratJalanModal`, `AddFinishingModal`
  - `ConfirmDialog`, `ModalFormShell`, `SearchableSelect`, `AuthWrapper`
  - `SyncStatus`, `ThemeProvider`, `ThemeScript`
  - `DeleteAllCashbookModal`, `SelectMonthModal`, `PpnFakturModal`
  - `SuratJalanTable`, `SalesHistoryTable`, `EditManualModal`
- Komentar AST/lib (`src/lib/ast/`):
  - `defaults.ts`, `cashbook-recalc.ts` (top-level docstring + komentar utama)
- Komentar scripts (`scripts/`):
  - `apply-migration.mjs`, `apply-supabase-schema.mjs`, `build-gemiprint-template-db.mjs`
  - `migrate-finance-to-v2.mjs`, `prepare-standalone-for-tauri.mjs`
  - `remove-stress-test-data.mjs`, `run-migration.mjs`
  - `seed-local-admin.mjs`, `seed-stress-test-data.mjs`
  - `sync-tauri-bundle-server.mjs`, `validate-v2-parity.mjs`, `wipe-supabase-public.mjs`
- Komentar Rust (`src-tauri/src/`):
  - `main.rs` (header + komentar inisialisasi DB, command Tauri, sync)
  - `sync.rs` (docstring publik utama)
- Test fixture:
  - `src/lib/__tests__/purchase-order-service.test.ts` regex error message disesuaikan ke "melebihi sisa pesanan pembelian"

Yang sengaja tidak disentuh di Fase 2 (sesuai aturan komentar Indonesia-first):
- Komentar generated/vendor di node_modules (di luar scope).
- Inline comment teknis dalam yang menyebut detail implementasi DSL parser/tokenizer di `src/lib/ast/dsl-*.ts`, `evaluator.ts`, `function-library.ts`, `validate.ts` — sebagian besar dokumentasi referensi yang akurat tetap berguna saat membaca AST. Top-level docstring sudah di-update; inline comment dibiarkan untuk menghindari resiko regresi semantik.
- Komentar di `src-tauri/src/sync.rs` yang sangat teknis (mis. detail HTTP request, parsing range header) — dibiarkan untuk kejelasan implementasi.

Verifikasi yang dijalankan setelah Fase 2 (2026-05-27):

- `npm run audit:bahasa` -> **1268 kandidat temuan**, turun dari 1683 (-415)
- `npm run type-check` -> **lulus, 0 error**
- `npm run build` -> **lulus, semua route tergenerasi**
- `npx jest` -> **lulus, 199 test, 17 suite**
- `flutter analyze` -> tidak dijalankan ulang (file Flutter tidak disentuh di Fase 2; terakhir lulus 2026-05-27)

Tren audit:
- Baseline awal Fase 1: 1741 temuan
- Setelah Fase 1 selesai: 1682 temuan (-59)
- Setelah Fase 2 selesai: 1268 temuan (-414 lagi)
- Total turun dari baseline: -473 (-27%)

Sebagian besar 1268 sisa temuan adalah:
- Identifier kode Inggris seperti `walkInFaktur`, `customerSearch`, `nomor_invoice` (Fase 3+).
- Komentar inline yang sangat teknis di AST evaluator, DSL parser, dan sync logic Rust.
- Test description Inggris (`it("rejects qty > sisa PO")`) yang masih English.
- Kolom database deployed yang Inggris (Fase 5).

## Fase 3 - Nama source code per domain

Status: **selesai pada 2026-05-27 oleh agen kedua**.

Yang sudah dilakukan:

- **Test description Inggris** diterjemahkan di seluruh `src/lib/__tests__/`:
  - `document-number-service.test.ts`, `roll-size-utils.test.ts`, `return-finance.test.ts`
  - `purchase-order-service.test.ts`, `return-service.test.ts`, `db-unified.test.ts`
  - `money-rounding.test.ts`, `quotation-service.test.ts`, `stock-opname-service.test.ts`
  - 199 test tetap lulus.
- **`customers-service.ts`** dirombak ke nama Indonesia primer:
  - Type primer: `Pelanggan` (alias deprecated `Customer = Pelanggan`).
  - Function primer: `getPelanggan`, `getPelangganById`, `createPelanggan`, `updatePelanggan`, `deletePelanggan`.
  - Alias deprecated tetap ada untuk semua nama lama supaya consumer tidak putus selama transisi.
  - Konsumer langsung sudah migrasi: `src/app/customers/actions.ts`, `src/app/api/customers/route.ts`, `src/app/pos/actions.ts`.
- **`materials-service.ts`** ditambah lapisan alias Indonesia tanpa mengganggu internal:
  - Type alias: `Barang = Material`, `HargaSatuan = UnitPrice`.
  - Function alias: `getBarang`, `getBarangById`, `createBarang`, `updateBarang`, `deleteBarang`, `getKategoriBarang`, `getSubkategoriBarang`, `getSatuan`.
  - Internal masih memakai `Material` untuk sekarang (akan disisir di batch terpisah supaya risiko regresi minimal).
- **`use-cached-data.ts`** JSDoc contoh diperbarui ke `pelanggan` (cache key).
- **State POS (`src/app/pos/page.tsx`)** banyak identifier di-rename ke Bahasa Indonesia:
  - `walkInFaktur` -> `fakturUmum`, `setWalkInFaktur` -> `setFakturUmum`
  - `walkInFakturInput` -> `fakturUmumInput`, `setWalkInFakturInput` -> `setFakturUmumInput`
  - `showWalkInFakturModal` -> `showFakturUmumModal`, `setShowWalkInFakturModal` -> `setShowFakturUmumModal`
  - `customerSearch` -> `pencarianPelanggan`, `setCustomerSearch` -> `setPencarianPelanggan`
  - `selectedCustomer` -> `selectedPelanggan`, `setSelectedCustomer` -> `setSelectedPelanggan`
  - `selectedCustomerIndex` -> `indexPelangganTerpilih`, `setSelectedCustomerIndex` -> `setIndexPelangganTerpilih`
  - `showCustomerDropdown` -> `showDropdownPelanggan`, `setShowCustomerDropdown` -> `setShowDropdownPelanggan`
  - `filteredCustomers` -> `filteredPelanggan`
  - `handleSelectCustomer` -> `handlePilihPelanggan`, `handleCustomerKeyDown` -> `handlePelangganKeyDown`
  - `resolvedWalkIn` -> `resolvedFakturUmum`
- **State customers/page.tsx** banyak identifier di-rename:
  - `setEditingCustomer` -> `setEditingPelanggan`, `editingCustomer` -> `editingPelanggan`
  - `updateCustomerInState` -> `updatePelangganInState`
  - `filteredCustomers` -> `filteredPelanggan`, `visibleCustomers` -> `visiblePelanggan`
  - `loadCustomers` -> `loadPelanggan`, `setCustomers` -> `setDaftarPelanggan`
  - `mutateCustomers` -> `mutatePelanggan`, `customersLoading` -> `pelangganLoading`
  - `customersData` -> `pelangganData`, `totalCustomers` -> `totalPelanggan`
  - Cache key `useCachedData` `"customers"` -> `"pelanggan"`.

Yang sengaja tidak disentuh di Fase 3:
- Field `customers` di interface `POSInitData` (kontrak API publik antara service ↔ page).
- Identifier `Customer[]` type masih dipakai di pos/page.tsx (alias deprecated yang masih ada).
- Banyak parameter `customer` lokal di handler/render — itu scope kecil, akan disisir saat rename type primer (Fase 3 lanjutan opsional).
- Internal `materials-service.ts` masih memakai `Material`/`UnitPrice` (alias `Barang`/`HargaSatuan` di-export untuk consumer baru).
- Identifier kode di service-service lain (purchases, finance, vendor, sales) — bisa jadi Fase 3 lanjutan, atau bareng Fase 4 (route/API rename).
- File rename (`customers-service.ts` -> `pelanggan-service.ts`, dll) — ini akan jadi commit terpisah di Fase 4 supaya mudah ditelusuri.

Verifikasi setelah Fase 3 (2026-05-27):

- `npm run audit:bahasa` -> 1268 kandidat temuan. Sebagian besar sisa adalah identifier kode yang sengaja ditahan + komentar inline teknis dalam.
- `npm run type-check` -> **lulus, 0 error**
- `npm run build` -> **lulus, semua route tergenerasi**
- `npx jest` -> **lulus, 199 test, 17 suite**

Tren audit:
- Baseline awal Fase 1: 1741
- Setelah Fase 1 selesai: 1682 (-59)
- Setelah Fase 2 selesai: 1268 (-414)
- Setelah Fase 3 selesai: 1268 (sama; rename identifier net-zero karena tambah alias deprecated)

Catatan: angka audit yang tidak turun di Fase 3 wajar karena strategi alias deprecated sengaja menambah identifier Inggris (sebagai alias) sambil menambah identifier Indonesia (sebagai primer). Audit menghitung keduanya. Ini akan turun di Fase 4 saat alias deprecated mulai dihapus (setelah semua consumer migrasi).

## Fase 4 - Route dan API

Status: **selesai sebagian pada 2026-06-04 oleh agen kedua**.

Yang sudah dilakukan di Fase 4 batch 1:

- **Rename folder route** `src/app/`:
  - `customers` -> `pelanggan`
  - `materials` -> `barang`
  - `dashboard` -> `beranda`
  - `settings` -> `pengaturan`
  - `finance` -> `keuangan`
  - `reports` -> `laporan`
  - `inventory` -> `inventori`
  - `users` -> `pengguna`
  - `production` -> `produksi`
  - `purchases` -> `pembelian`
  - `purchase-orders` -> `pesanan-pembelian`
  - `purchase-returns` -> `retur-pembelian`
  - `sales-returns` -> `retur-penjualan`
  - Memakai `git mv` supaya history terjaga.
- **Redirect 301 di `next.config.ts`** untuk semua URL lama -> URL baru. Bookmark dan link luar tetap bekerja.
- **Update internal Link di komponen**:
  - `src/components/menuConfig.tsx` (semua href + breadcrumb mapping)
  - `src/components/MainShell.tsx` (router.replace fallback)
  - `src/components/AddMaterialModal.tsx` (link ke `/pengaturan?tab=...`)
  - `src/components/AddFinishingModal.tsx` (router.push)
  - `src/app/page.tsx` (router.push setelah login)
  - `src/app/auth/login/page.tsx` (router.push setelah login)
  - `src/app/keuangan/page.tsx`, `src/app/laporan/page.tsx` (router.push fallback)
  - `src/app/beranda/page.tsx` (Link ke /produksi, /pesanan-pembelian)
  - `src/app/produksi/page.tsx` (redirect ke /produksi/spk)
  - `src/app/kelola-pengurus/page.tsx`, `src/app/kelola-orang/page.tsx` (router.replace ke /keuangan)
  - `src/app/inventori/movements/page.tsx` (link ke /pembelian, /retur-penjualan, /retur-pembelian, /inventori/opname, /inventori/adjustments)
  - `src/app/retur-pembelian/page.tsx` (Link ke /pembelian)
- **Update import path** di file yang masih merujuk `@/app/settings/actions` -> `@/app/pengaturan/actions`:
  - `src/app/pengaturan/PpnTab.tsx`, `src/app/pengaturan/NomorUrutTab.tsx`
  - `src/app/pos/page.tsx`
  - `src/components/PpnFakturModal.tsx`, `src/components/PurchaseTable.tsx`
  - `src/components/SalesHistoryTable.tsx`, `src/components/SyncStatus.tsx`

Yang sengaja tidak dirubah di Fase 4 batch ini:
- **Folder `src/app/api/`** masih memakai nama Inggris (`/api/customers`, `/api/materials`, dll). Itu kontrak API publik yang dipanggil dari Flutter mobile + Tauri desktop. Rename API endpoint butuh sub-batch terpisah dengan strategi alias supaya client mobile/desktop tidak putus. Akan dijadwalkan di Fase 4 lanjutan.
- **Flutter route dan API path** (mis. `flutter/lib/services/customers_service.dart` panggil `/api/customers`). Itu masih valid karena endpoint Next.js `/api/customers/` masih ada.
- **File service rename** (mis. `customers-service.ts` -> `pelanggan-service.ts`). Akan jadi Fase 6 cleanup.

Verifikasi setelah Fase 4 batch 1 (2026-06-04):

- `npm run type-check` -> **lulus, 0 error**
- `npm run build` -> **lulus, semua route Indonesia tergenerasi**
- `npx jest` -> **lulus, 199 test, 17 suite**
- `flutter analyze` -> **lulus, No issues found**
- `npm run audit:bahasa` -> 1265 kandidat (turun dari 1268)

## Fase 5 - Database, sync, dan migrasi

Status: **batch 1 selesai pada 2026-06-04 oleh agen kedua**.

Asumsi penting: pemilik konfirmasi database masih kosong (instalasi pertama / development), jadi rename pakai `ALTER TABLE ... RENAME COLUMN` langsung tanpa strategi additive dual-write. Strategi additive akan diperlukan kalau di masa depan database sudah berisi data produksi.

Yang sudah dilakukan di Fase 5 batch 1:

- **Migrasi Supabase baru:** `supabase/migrations/20260604143000_rename_nomor_invoice_to_nomor_faktur.sql`
  - `ALTER TABLE penjualan RENAME COLUMN nomor_invoice TO nomor_faktur`
  - Rename constraint `penjualan_nomor_invoice_key` -> `penjualan_nomor_faktur_key` (bersyarat).
  - Rename indeks `idx_penjualan_nomor_invoice` -> `idx_penjualan_nomor_faktur` (bersyarat).
- **SQLite schema** (`database/sqlite-schema.sql`): kolom `nomor_invoice` di tabel `penjualan` di-rename jadi `nomor_faktur`.
- **Runtime ALTER di `src/lib/db-unified.ts`**: helper `renameColumnIfNeeded` baru untuk migrasi instalasi SQLite lama yang sudah punya kolom `nomor_invoice`.
- **`supabase/schema.sql`** (template fresh-install Postgres) ikut di-update.
- **Service code di-update** dari `nomor_invoice` ke `nomor_faktur`:
  - `src/lib/services/pos-service.ts`, `purchases-service.ts`, `reports-service.ts`, `return-service.ts`
  - `src/lib/services/production-service.ts`, `surat-jalan-service.ts`, `audit-log-service.ts`
  - `src/lib/services/ppn-report-service.ts`, `materials-service.ts`
  - `src/lib/thermal-print.ts`, `faktur-print.ts`, `surat-jalan-print.ts`
- **Komponen UI di-update**:
  - `src/components/SuratJalanTable.tsx`, `PayReceivableModal.tsx`, `POSCart.tsx`
  - `src/components/SalesHistoryTable.tsx`, `LaporanPpnPanel.tsx`
- **Halaman app di-update**:
  - `src/app/pos/page.tsx`, `src/app/produksi/spk/page.tsx`
  - `src/app/retur-penjualan/page.tsx`, `src/app/surat-jalan/page.tsx`
  - `src/app/api/pos/sales/route.ts`
- **Flutter di-update**:
  - `flutter/lib/features/pos/pos_page.dart`
  - `flutter/lib/models/sale.dart`, `flutter/lib/models/production.dart`
- **Test fixture di-update** di `src/lib/__tests__/return-service.test.ts`.

Verifikasi setelah Fase 5 batch 1 (2026-06-04):

- `npm run supabase:local:reset` -> **lulus**, semua migrasi (termasuk yang baru) berhasil applied di Postgres lokal.
- `npm run type-check` -> **lulus, 0 error**.
- `npm run build` -> **lulus, semua route tergenerasi**.
- `npx jest` -> **lulus, 199 test, 17 suite**.
- `flutter analyze` -> **lulus, No issues found**.

Hal yang sengaja tidak disentuh:
- **Migrasi lama yang sudah di-`applied` ke cloud** (mis. `20260425120000_initial_schema.sql`) — iron rule: tidak boleh diedit. Migrasi baru yang menangani rename.
- **Tabel-tabel English yang masih ada** (`inventory_movements`, `purchase_orders`, `purchase_order_items`, `stock_opnames`, `stock_opname_items`, `barang_roll_variants`, `accounting_periods`) — rename tabel berisiko jauh lebih tinggi karena banyak FK. Akan jadi Fase 5 batch 2+ jika diperlukan, atau ditahan permanen sebagai eksepsi (tergantung keputusan pemilik).

## Fase berikutnya

1. **Fase 5 batch 2 (opsional)**
   - Rename tabel English yang tersisa ke Indonesia (`inventory_movements` -> `mutasi_stok`, dll).
   - Risiko: setiap tabel punya banyak FK, harus diiringi `RENAME` di seluruh referensi service + Flutter + Tauri sync engine.
   - Direkomendasikan ditahan dulu sampai pemilik benar-benar mau (banyak biaya, value tambahan kecil).

2. **Fase 6 - Cleanup**
   - Rename file service (`customers-service.ts` -> `pelanggan-service.ts`, dll).
   - Hapus alias deprecated yang ditambahkan di Fase 3 (`getCustomers`, `Customer`, `getMaterials`, dll).
   - Rename folder `src/app/api/` ke Indonesia dengan strategi alias.
   - Update Flutter consumer ke endpoint API baru.
   - Hapus alias setelah semua consumer migrasi.

## Fase 6 - Cleanup

Status: **selesai pada 2026-06-04 oleh agen kedua**.

Yang sudah dilakukan di Fase 6 (Opsi 2 — D + E + C):

- **Hapus alias deprecated dari Fase 3** (`customers-service.ts`):
  - Type `Customer` (alias `Pelanggan`) dihapus.
  - Function `getCustomers`, `getCustomerById`, `createCustomer`, `updateCustomer`, `deleteCustomer` dihapus.
  - Konsumer migrasi: `src/app/pelanggan/page.tsx`, `src/app/pelanggan/actions.ts`, `src/app/pos/actions.ts`, `src/lib/use-cached-data.ts`.
  - Action `getCustomersAction` -> `getPelangganAction`, `createCustomerAction` -> `createPelangganAction`, dll.
- **Rename komponen modal** di `src/components/`:
  - `AddFinishingModal` -> `ModalTambahFinishing`
  - `AddMaterialModal` -> `ModalTambahBarang`
  - `CloseBooksModal` -> `ModalTutupBuku`
  - `ConfirmDialog` -> `DialogKonfirmasi`
  - `DeleteAllCashbookModal` -> `ModalHapusSemuaBukuKas`
  - `EditManualModal` -> `ModalEditManual`
  - `EditPriceModal` -> `ModalEditHarga`
  - `ImportCsvModal` -> `ModalImporCsv`
  - `PayDebtModal` -> `ModalBayarHutang`
  - `PayReceivableModal` -> `ModalBayarPiutang`
  - `PurchaseReturnModal` -> `ModalReturPembelian`
  - `QuickAddCustomerModal` -> `ModalTambahCepatPelanggan`
  - `QuickAddMaterialModal` -> `ModalTambahCepatBarang`
  - `QuickAddVendorModal` -> `ModalTambahCepatVendor`
  - `SelectMonthModal` -> `ModalPilihBulan`
- **Rename komponen tabel/form/utility** di `src/components/`:
  - `AuthWrapper` -> `PembungkusAuth`
  - `FloatingCalculator` -> `KalkulatorMengambang`
  - `FloatingFakturPreview` -> `PratinjauFakturMengambang`
  - `NotificationToast` -> `ToastNotifikasi`
  - `POSCart` -> `KeranjangPOS`
  - `PurchaseForm` -> `FormulirPembelian`
  - `PurchaseTable` -> `TabelPembelian`
  - `SalesHistoryTable` -> `TabelRiwayatPenjualan`
  - `SearchableSelect` -> `PilihanCari`
  - `SyncStatus` -> `StatusSinkronisasi`
- **Rename folder `src/app/api/`** dengan strategi alias keep-old:
  - Folder primer Indonesia: `pelanggan`, `barang`, `pengguna`, `pembelian`, `produksi`, `laporan`, `inventori`, `keuangan`.
  - Folder lama (Inggris) tetap ada sebagai re-export shim supaya Flutter mobile dan Tauri yang masih panggil `/api/customers`, `/api/finance/cash-book`, dll tetap berfungsi.
- **Update web consumer** untuk panggil endpoint API baru (`/api/keuangan/...`, `/api/laporan/...`).
- **Tidak rename komponen** yang sudah Indonesia atau yang merefer library framework: `BagiHasilManageModal`, `LaporanPpnPanel`, `MaklonLineModal`, `MainShell`, `PpnFakturModal`, `SuratJalanModal`, `SuratJalanTable`, `IndonesianNativeValidity`, `menuConfig`, `ModalFormShell`, `ThemeProvider`, `ThemeScript`.
- **Tidak rename file `src/lib/services/*-service.ts` dan `src/lib/*.ts`** (Opsi A/B). Konvensi: nama file Inggris boleh untuk service/utility internal yang dibaca programmer, UI dan content harus Bahasa Indonesia. Lihat `panduan-bahasa.md` bagian "Keputusan akhir Fase 6".

Verifikasi setelah Fase 6 (2026-06-04):

- `npm run type-check` -> **lulus, 0 error**.
- `npm run build` -> **lulus, semua route tergenerasi**.
- `npx jest` -> **lulus, 199 test, 17 suite**.

## Catatan akhir

Semua 6 fase normalisasi bahasa Indonesia-first sudah selesai untuk
artefak user-facing dan komponen UI. Yang sengaja ditahan permanen
sebagai eksepsi (lihat panduan-bahasa.md):

- Nama file di `src/lib/services/` dan `src/lib/` boleh tetap Inggris
  (suffix `-service.ts`, `db-unified.ts`, dll) karena dibaca programmer
  dan rename luas akan menyentuh semua import path tanpa value tambah.
- Tabel database Inggris yang masih ada (`inventory_movements`,
  `purchase_orders`, dll) — rename tabel risikonya jauh lebih tinggi
  karena banyak FK; ditahan kecuali pemilik benar-benar mau.
- Folder `src/app/api/` versi Inggris dipertahankan sebagai re-export
  shim sampai Flutter mobile migrasi ke endpoint baru.

## Catatan untuk agen berikutnya

- Baca `.cursorrules`, `docs/agent-playbook.md`, dan `docs/panduan-bahasa.md` sebelum mulai.
- Baca juga `docs/prompt-agen-lanjutan-seragam-bahasa.md` untuk prompt siap pakai agen berikutnya.
- Jangan melakukan rename massal lintas DB/API/UI dalam satu batch.
- Setiap selesai fase atau batch besar, update dokumen ini dengan tanggal, file utama yang disentuh, keputusan baru, dan sisa pekerjaan.
