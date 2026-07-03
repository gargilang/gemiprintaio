# Desain: Keranjang Tersimpan, Katalog Maklon, Integrasi POS Maklon, & Pratinjau Faktur

- **Tanggal:** 2026-07-04
- **Status:** Disetujui (siap → writing-plans)
- **Lingkup:** 4 fitur pada halaman POS/Kasir, halaman Penawaran, dan admin Katalog Maklon.

## Latar belakang & tujuan

Pemilik butuh 4 hal:

1. **Simpan keranjang** di POS — parkir cart pelanggan yang masih pending (3-10 pelanggan via WhatsApp), panggil balik untuk finalisasi/edit.
2. **Daftar barang maklon berulang** — saat ini tiap baris maklon diketik bebas; banyak barang sama dijual ke beberapa pelanggan, repot ngetik berulang.
3. **Sembunyikan "resep dapur" maklon** — UI POS saat ini terang-terangan menampilkan vendor & biaya subkontrak; customer sering duduk di sebelah kasir. Maklon harus terlihat seperti penjualan produk biasa.
4. **Tombol Pratinjau Penawaran** — hilangkan label "Penawaran Harga", tampilkan nomor faktur paling terkini agar preview bisa dipakai negosiasi harga "oknum".

## Keputusan desain (hasil brainstorming)

| # | Topik | Pilihan |
|---|---|---|
| Q1 | Simpan keranjang | **Hybrid C** — tabel ringan `keranjang_tersimpan` + tombol "Jadikan Penawaran" untuk naik ke jalur formal. Halaman Penawaran tetap jalur resmi (PT/cetak PDF). |
| Q2 | Daftar barang maklon | **A** — halaman & tabel baru `katalog_maklon` (terpisah dari Data Barang). |
| Q3 | Integrasi UI maklon | **A+C** — picker produk terpadu (tidak ada tombol "Maklon" terpisah) + akses rincian internal vendor/biaya via ikon 👁 kecil (bukan toggle global). |
| Q4 | HPP maklon | **C** — `hppTotal = biaya_subkontrak` + auto-PO vendor per grup vendor+metode. **Sudah ada di kode** (`pos-mutations.ts`, `purchases-mutations.ts`). Tidak ada infrastruktur baru. |
| Q5 | Pratinjau Faktur | Tombol "Lihat Faktur"; nomor = faktur **berikutnya** (preview, tidak konsumsi counter); header pakai logo/nama toko; judul dokumen "Faktur Penjualan". |
| Q6 | Lifecycle parked cart | **C** — label auto + opsional edit; auto-expire 30 hari; maks ~30. |

## Arsitektur & decomposisi

Empat workstream, urutan rekomendasi: **#4 dulu** (paling kecil) → **#2** → **#3** → **#1**, atau paralel **#4 + #1** lalu **#2 + #3**.

1. **Keranjang Tersimpan** — tabel `keranjang_tersimpan` + UI parkir/panggil di POS.
2. **Katalog Maklon** — tabel `katalog_maklon` + halaman admin + integrasi picker POS.
3. **POS Picker Terpadu + Rincian Internal** — ganti tombol "Maklon" jadi picker terpadu + "Tambah Item Lainnya" + modal rincian internal (privacy C).
4. **"Lihat Faktur"** — ubah tombol Pratinjau di `KeranjangPOS.tsx`.

Workstream 2 & 3 terkait erat (katalog harus muncul di picker baru). 1 & 4 independen.

## Data model

### Tabel baru #1: `keranjang_tersimpan` (parked cart, ringan)

| kolom | tipe | keterangan |
|---|---|---|
| `id` | text PK | |
| `label` | text | editable, default auto: `"<Nama Pelanggan> · <N> item · <HH:MM>"` |
| `pelanggan_id` | text FK `pelanggan` nullable | |
| `pelanggan_nama_snapshot` | text nullable | untuk "Pelanggan Umum" |
| `pelanggan_kota` | text nullable | |
| `prioritas` | text | `'NORMAL' \| 'KILAT'` |
| `ppn_snapshot` | jsonb nullable | data PPN faktur jika diset |
| `cart_snapshot` | jsonb | array CartItem lengkap (barang + maklon + biaya_tambahan + finishing + katalog_maklon_id per baris) |
| `status` | text | `'AKTIF' \| 'KEDALUWARSA' \| 'JADIKAN_PENAWARAN' \| 'FINAL'` |
| `penawaran_id` | text FK `penawaran` nullable | terisi saat "Jadikan Penawaran" |
| `kedaluwarsa_pada` | timestamptz | `dibuat_pada + 30 hari` |
| `dibuat_oleh` | text FK `pengguna` | kasir |
| `dibuat_pada`, `diperbarui_pada` | timestamptz | |
| sync columns | | `sync_status, last_synced_at, sync_version, updated_at_server, updated_by_device, change_version, is_deleted, deleted_at, client_mutation_id` (iron rule 8) |

Pilihan `cart_snapshot` JSON (bukan child table) karena struktur cart heterogen. Edit = load JSON → ubah → simpan utuh. Sync = satu baris satu unit.

### Tabel baru #2: `katalog_maklon` (template produk maklon berulang)

| kolom | tipe | keterangan |
|---|---|---|
| `id` | text PK | |
| `nama_produk` | text | nama customer-facing, mis. "Banner Spanduk 3x1" |
| `nama_satuan` | text default `'pcs'` | |
| `harga_jual_default` | numeric | harga ke customer |
| `biaya_subkontrak_default` | numeric | biaya vendor (internal, tersembunyi) |
| `vendor_subkontrak_id_default` | text FK `vendors` nullable | vendor default |
| `metode_bayar_vendor_default` | text | `'CASH' \| 'NET30'` |
| `kategori` | text nullable | grouping di picker |
| `catatan_internal` | text nullable | catatan kasir/admin |
| `is_aktif` | int default 1 | |
| `urutan` | int default 0 | urutan tampil |
| `dibuat_oleh`, `dibuat_pada`, `diperbarui_pada` | | |
| sync columns | | sama seperti di atas |

### Tabel existing: tidak ada perubahan skema wajib

Field maklon (`tipe_item`, `vendor_subkontrak_id`, `biaya_subkontrak`, `metode_bayar_vendor`, `deskripsi_pekerjaan`) sudah ada di `item_penjualan` & `item_penawaran`. Placeholder `barang-jasa-maklon` tetap dipakai sebagai `barang_id` baris maklon.

**Opsional v1.1 (bukan sekarang, YAGNI):** tambah `katalog_maklon_id` ke `item_penjualan` + `item_penawaran` untuk laporan "produk katalog terlaris".

## Workstream 1 — Keranjang Tersimpan

### UI di header `KeranjangPOS`

- **Tombol "Parkir"** (ikon kotak + panah bawah) — aktif kalau cart tidak kosong. Klik → modal kecil:
  - Input label, **pre-isi otomatis**: `"<Nama Pelanggan> · <N> item · <HH:MM>"` (atau `"Pelanggan Umum · ..."` kalau tidak ada pelanggan). Kasir bisa edit.
  - Tombol "Parkir" → simpan, cart dikosongkan, toast "Keranjang diparkir".
- **Tombol "Keranjang Tersimpan (N)"** (dropdown) — daftar baris:
  - `<label>` · `<item count> item` · `<jam>` · badge status (AKTIF/KEDALUWARSA).
  - Aksi per baris: **Muat**, **Jadikan Penawaran**, **Hapus**.
  - "Muat" kalau cart sekarang tidak kosong → konfirmasi "Ganti keranjang saat ini?".

### Lifecycle

- **Auto-expire 30 hari:** tampil "KEDALUWARSA" (abu-abu, masih bisa dimuat/hapus). Hitung `kedaluwarsa_pada` saat insert; tampilan di-filter dari timestamp.
- **Maks ~30:** di atas 30, UI peringatan "Finalisasi atau jadikan penawaran dulu". Tidak di-hard-block.
- **Status transisi:**
  - "Muat" + finalize checkout → `FINAL` (arsip untuk audit, hilang dari dropdown AKTIF).
  - "Jadikan Penawaran" → `JADIKAN_PENAWARAN`, `penawaran_id` terisi, buka/link ke `/penawaran`.
  - Hapus → soft delete (`is_deleted=1`).

### "Jadikan Penawaran"

Panggil `createQuotation` dengan items dari `cart_snapshot` (termasuk baris maklon → `tipe_item="MAKLON"` + vendor/biaya dari snapshot). Dapat nomor `QUO-...`. Status parked → `JADIKAN_PENAWARAN`. Selanjutnya finalize lewat halaman Penawaran (konversi ke faktur via `convertQuotationToSale`).

### Service & API

- `src/lib/services/keranjang-tersimpan-service.ts`: `parkCart`, `listParkedCarts`, `loadParkedCart`, `deleteParkedCart`, `markFinal`, `jadikanPenawaran`, `expireOldCarts` (opsional cron, bisa juga lazy saat list).
- `src/app/api/keranjang-tersimpan/route.ts` (+ `[id]/route.ts`): REST endpoint, `requireSession` di mutating.
- `src/app/pos/actions.ts` (atau `src/app/pos/keranjang-tersimpan-actions.ts`): server actions untuk parkir/muat/hapus/jadikan-penawaran, `requireSession`.

## Workstream 2 — Katalog Maklon (admin)

### Route & menu

- Route: `/katalog-maklon`. Menu admin, label "Katalog Maklon". Customer tidak pernah lihat menu admin (hanya kasir di POS), jadi label "Maklon" di sini aman — sesuai AGENTS.md, "maklon" adalah istilah operasional yang dipertahankan di konteks internal/admin/laporan.
- Tambah ke `src/components/menuConfig.tsx` (grouping:Produksi atau Penjualan — disepakati saat implementasi).

### Halaman

Tabel CRUD standar (ikut pola `src/app/barang/page.tsx` / `src/app/vendors/page.tsx`):
- Kolom: nama_produk, satuan, harga_jual_default, biaya_subkontrak_default, vendor default, metode bayar default, kategori, aktif, urutan.
- Modal form tambah/edit (`ModalFormShell`), konfirmasi hapus (`DialogKonfirmasi`).
- Pencarian + filter kategori.
- Halaman root `<div className="space-y-6">` + gradient title card (iron rules UI).
- Dark mode wajib di tiap elemen.
- `error.tsx` area.

### Service & API

- `src/lib/services/katalog-maklon-service.ts`: `listKatalogMaklon`, `createKatalogMaklon`, `updateKatalogMaklon`, `deleteKatalogMaklon`.
- `src/app/api/katalog-maklon/route.ts` (+ `[id]/route.ts`): REST, `requireAdminOrManager` di mutating.
- `src/app/katalog-maklon/actions.ts`: server actions, `requireAdminOrManager`, `dibuat_oleh = session.uid`.
- Validasi input dengan Zod (`src/lib/schemas/katalog-maklon.ts`), `safeParse` → 422.
- Error DB via `friendlyPgError(e, "katalog_maklon")`.

## Workstream 3 — POS Picker Terpadu + Rincian Internal

### A. Picker produk terpadu

- `produkJualList` (flatten `materials` → unit_prices) **digabung** dengan baris `katalog_maklon` aktif. Tiap entri pakai shape yang sama + flag internal `sumber: "BARANG" | "KATALOG_MAKLON"` + `katalog_maklon_id` (kalau maklon).
- Pencarian POS cari by `nama` — katalog maklon muncul berdasarkan `nama_produk`. Customer lihat satu daftar produk biasa, tidak ada label "Maklon".
- Klik entri katalog → bangun baris cart `tipe_item="MAKLON"`:
  - `barang_id = ID_BARANG_PLACEHOLDER_MAKLON`
  - `deskripsi_pekerjaan = nama_produk`
  - `harga_satuan = harga_jual_default` (editable)
  - `biaya_subkontrak = biaya_subkontrak_default`
  - `vendor_subkontrak_id = vendor_default`
  - `metode_bayar_vendor = metode_default`
  - `nama_satuan` dari katalog
- Tampilan baris di cart: **identik** dengan baris barang (nama, qty, harga, subtotal). Tidak ada badge "Maklon" di permukaan.
- Data katalog dimuat via `getPOSInitData` (tambah field `katalogMaklon`), cache key `"pos-init"` tetap.

### B. "Tambah Item Lainnya" (ganti tombol "Maklon")

- Label netral, ikon `+`. Buka modal kecil dengan 2 section:
  - **Section "Pelanggan"** (terlihat): nama item, qty, satuan, harga jual.
  - **Section "Rincian Internal"** (collapsed default, ikon 👁): vendor, biaya_subkontrak, metode bayar vendor.
  - **Validasi inline:** simpan ditolak kalau "Rincian Internal" belum diisi (vendor + biaya > 0 + metode). Pesan error arahkan ke section itu. Menjaga invariant `createSale` yang sudah ada.
- Hasil: baris cart `tipe_item="MAKLON"` tanpa `katalog_maklon_id` (ad-hoc).

### C. Rincian internal per baris (ikon 👁 kecil di tiap baris maklon)

- Klik → modal edit baris dengan 2 section sama (Pelanggan + Internal collapsed). Edit vendor/biaya/metode tanpa mengganggu tampilan utama cart.
- Pakai `ModalFormShell` + `useFocusTrap`.

### D. Yang dihapus

- Tombol "Maklon" biru tua di `pos/page.tsx` L1431-1449.
- `MaklonLineModal` multi-line-per-vendor diganti alur di atas. Multi-line maklon = klik beberapa produk katalog / "Tambah Item Lainnya" beberapa kali. Auto-PO grouping per vendor+metode di `createSale` tetap jalan → finance tidak berubah.

### ⚠️ Konsekuensi invariant (dikonfirmasi pemilik: OK)

Karena `createSale` wajib `vendor_subkontrak_id` + `biaya_subkontrak > 0` + `metode_bayar_vendor` + `deskripsi_pekerjaan` untuk setiap baris maklon, maka:

- Ad-hoc "Tambah Item Lainnya" **wajib isi Rincian Internal sebelum baris bisa disimpan** (tidak bisa "isi belakangan"). Validasi inline di modal.
- Katalog: pre-isi → kasir tidak ngerasa.
- Pemilik menyetujui tetap wajib (jaga HPP & finance rapi). **Tidak ada relaksasi `createSale`.**

## Workstream 4 — "Lihat Faktur" (Pratinjau diubah)

### Di `KeranjangPOS.tsx`

- Tombol: label **"Lihat Faktur"** (ikon mata tetap), `title="Lihat faktur"`.
- `handlePreviewQuotation` → `handlePreviewFaktur`:
  - `nomor_faktur`: **preview nomor faktur berikutnya** — panggil `generateDailyDocumentNumber("penjualan", "nomor_faktur", <prefix>, today)` **tanpa persist** (fungsi hanya query max+1, tidak insert; insert hanya di `createSale`). Counter tidak terkonsumsi.
  - `shop`: **pass shop settings** dari `POSPage` (sekarang `shop: undefined` → ubah ke `shopSettings` yang sudah di-load di POS). Header logo/nama toko muncul seperti faktur asli.
  - `patchQuotationHTML`: ganti teks `"Penawaran Harga"` → `"Faktur Penjualan"`.
  - `dispatch` event `gemi:preview-faktur`: `title: "Faktur Penjualan"`.

### Halaman `/penawaran` tidak berubah

`printQuote` di sana tetap pakai "Penawaran Harga" + nomor QUO (jalur formal/PT/PDF). Hanya tombol Pratinjau di POS yang berubah.

### Catatan race preview

`generateDailyDocumentNumber` tidak persist, jadi dua preview bersamaan bisa dapat nomor sama. Acceptable untuk preview (bukan transaksi). Saat checkout, `createSale` generate ulang nomor resmi.

## Catatan cross-cutting — HPP & Finance Maklon (tidak ada kode baru)

- Perilaku existing dipertahankan: `hppTotal maklon = biaya_subkontrak`, auto-PO maklon per grup vendor+metode (CASH→keuangan, NET30→hutang_pembelian), via `createMaklonPurchase` di `purchases-mutations.ts`.
- Katalog template pre-isi biaya & vendor → validasi `createSale` selalu lewat tanpa kasir mikir.
- Ad-hoc line wajib isi rincian internal → validasi lewat.
- Iron rule #4 (`[REF:<id>]` di keperluan, `payDebt`/`revertDebtPayment`) sudah dipatuhi kode existing.
- Laporan laba kotor maklon = `subtotal − biaya_subkontrak` (komputabel dari data existing).

## Edge cases & non-goals

- **Parkir cart dengan PPN:** `ppn_snapshot` disimpan, load balik PPN calc utuh.
- **Parkir cart berisi maklon:** `cart_snapshot` bawa semua field maklon; load balik tetap maklon.
- **"Jadikan Penawaran" dari parked cart berisi maklon:** `createQuotation` terima item maklon (sudah didukung `quotation-service`).
- **Mobile/Flutter:** parked cart & katalog maklon **out of scope v1**. Flutter lite companion; tambah endpoint nanti kalau dibutuhkan. API route standar dibuat sekarang supaya siap, tapi UI Flutter tidak.
- **Laporan "katalog terlaris":** v1.1 (butuh `katalog_maklon_id` di `item_penjualan`).
- **Migrasi (iron rule 2 & 8):** 2 tabel baru → (a) `supabase/migrations/<timestamp>_<nama>.sql` (additive, `IF NOT EXISTS`); (b) `database/sqlite-schema.sql`; (c) runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts`; (d) register `src/lib/sync-config.ts`.
- **Tidak ada rename kolom/path existing** — aman dari sisi deployed-contract.

## UI & iron rules yang dipatuhi

- Halaman root `<div className="space-y-6">`, gradient title card, dark mode wajib, `ModalFormShell`, `DialogKonfirmasi`, `useFocusTrap`, `useCachedData` untuk fetch (iron rules UI).
- Auth guard: `requireSession` / `requireAdminOrManager` di tiap mutating (iron rule 14).
- Validasi Zod + `safeParse` → 422, `.passthrough()`, `z.coerce.number().finite()` (iron rule 15).
- `friendlyPgError` (iron rule 16).
- SVG icon, bukan emoji (iron rules icons).
- Komentar/JSDoc baru dalam Bahasa Indonesia (language standard).
- Idempotent ledger IDs tidak terpengaruh (tidak ada mutation ledger baru di workstream ini selain yang sudah ada).

## Verifikasi yang dijalankan setelah implementasi

Per iron rule 10:
1. `npm run type-check` (0 error).
2. `npm run build`.
3. `npx jest src/lib/__tests__/keranjang-tersimpan-service.test.ts` (baru).
4. `npx jest src/lib/__tests__/katalog-maklon-service.test.ts` (baru).
5. `npx jest src/lib/__tests__/quotation-service.test.ts` (regresi — "Jadikan Penawaran" dari parked cart).
6. `npx jest src/app/pos/__tests__/*` (regresi POS).
7. Lint warnings baru wajib diperbaiki.