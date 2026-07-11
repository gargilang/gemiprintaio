# Barang Maklon Berdimensi (harga per m²)

Tanggal: 2026-07-12

## Latar belakang

Di halaman **Katalog Extra** (`/katalog-maklon`) dan **POS/Kasir** (`/pos`), user bisa
menambahkan barang maklon. Saat ini maklon selalu **flat-priced**:
`harga_jual_default × jumlah`. Sebagian barang maklon sebenarnya dihitung
berdasarkan **lebar × panjang** (harga per m²), sama seperti barang cetak di
Data Barang.

## Tujuan

Barang maklon bisa ditandai "berdimensi". Bila berdimensi, harganya dihitung
`Lebar × Panjang × Jumlah lembar × harga per m²` — persis seperti barang cetak
di Data Barang, tetapi **tanpa** pembulatan ukuran roll (versi sederhana).
Bila tidak berdimensi, tetap flat seperti sekarang.

## Keputusan (hasil brainstorm)

1. **Perhitungan sederhana**: `Lebar × Panjang × Jumlah lembar × harga/m²`.
   Tanpa pembulatan/pemilihan ukuran roll (`getBillableDimensionsForRoll` tidak
   dipakai untuk maklon).
2. **Flag "Butuh dimensi" tersedia di dua tempat**: modal Katalog Extra
   (`ModalKatalogMaklon.tsx`) DAN modal ad-hoc POS (`ModalTambahItemLainnya.tsx`).
3. **Input jumlah = jumlah lembar**: total m² = `jumlah × lebar × panjang`
   (konsisten dengan barang cetak biasa).
4. **Satuan dikunci ke `m²`** saat "Butuh dimensi" aktif (konsisten dengan
   Data Barang yang mengunci base unit ke m²). "Harga Jual" diartikan per m².

## Perubahan

### 1. Data model — kolom baru `butuh_dimensi_status`

Satu kolom baru di tabel `katalog_maklon`:
`butuh_dimensi_status INTEGER NOT NULL DEFAULT 0`.

Disinkronkan di **3 tempat** (Iron rule #2):

- (a) migrasi baru `supabase/migrations/20260712120000_katalog_maklon_dimensi.sql`
  — additive, `ADD COLUMN IF NOT EXISTS`, default 0.
- (b) template `database/sqlite-schema.sql` — blok `CREATE TABLE katalog_maklon`.
- (c) runtime `ALTER TABLE ADD COLUMN` di `src/lib/db-unified.ts` — pola sama
  seperti blok `populer_status` (~baris 1729), dan tambahkan juga ke blok
  `CREATE TABLE IF NOT EXISTS katalog_maklon` (~baris 2149) untuk fresh install.

`sync-config.ts` tidak berubah (`katalog_maklon` sudah terdaftar; kolom sync
sudah ada).

Interface `KatalogMaklon` (`src/lib/services/katalog-maklon-service.ts`) +
Zod `katalogMaklonInputSchema` (`src/lib/schemas/katalog-maklon.ts`) dapat
field `butuh_dimensi_status`
(`z.coerce.number().int().min(0).max(1).default(0)`), dan service
create/update menuliskannya.

### 2. UI — checkbox "Butuh dimensi"

**`ModalKatalogMaklon.tsx`**: checkbox "Butuh dimensi (harga per m²)". Saat aktif:
- label "Harga Jual" → "Harga Jual per m²".
- satuan otomatis dikunci ke `m²` (input disabled).

**`ModalTambahItemLainnya.tsx`** (POS ad-hoc): checkbox sama; saat aktif satuan
dikunci ke `m²`. Nilai diteruskan lewat `TambahItemLainnyaValue.butuh_dimensi_status`
dan disimpan lewat `createKatalogMaklonAction` di `handleSaveTambahItemLainnya`
(`page.tsx`).

### 3. POS — perhitungan & tampilan

- Tipe `ProdukJualFlat` (`pos-types.ts`) sudah punya `butuh_dimensi_status?`.
  Mapping produk maklon (`page.tsx:481`) teruskan
  `butuh_dimensi_status: k.butuh_dimensi_status`.
- `handleProdukJualClick` (`page.tsx:746`): berhenti hardcode
  `butuh_dimensi_status: 0`; pakai `produk.butuh_dimensi_status ?? 0`.
- Blok UI dimensi (`page.tsx:2041`): hapus guard
  `!selectedMaterial._isKatalogMaklon` supaya input Lebar × Panjang muncul untuk
  maklon berdimensi. **Sub-blok roll-rounding (`page.tsx:2082+`) disembunyikan
  bila maklon** (versi sederhana).
- `buildCartItemFromForm`: math dimensi (baris 606–645) sudah menghasilkan
  `finalQuantity` (m²) = `billedP × billedL × jumlahRoll`. Karena roll-rounding
  tidak dipakai untuk maklon, `billedP/L` = input asli. **Cabang maklon
  (682–709) kini juga mengisi `butuh_dimensi`, `panjang`, `lebar`,
  `jumlah_roll`** di CartItem — supaya kartu keranjang menampilkan
  `N × L × P m = qty m² @ Rp harga` (logika tampilan di `KeranjangPOS.tsx:455`
  sudah ada, tinggal diberi field).

### 4. Checkout

`jumlah` (m²) mengalir apa adanya ke `item_penjualan` (seperti barang cetak
biasa). Tidak ada perubahan skema `item_penjualan` — `panjang`/`lebar`/
`jumlah_roll` sudah didukung di payload (`KeranjangPOS.tsx:222-226`).

## Di luar lingkup (YAGNI)

- Tidak ada pembulatan/pemilihan ukuran roll untuk maklon.
- Tidak ada perubahan Flutter (maklon dimensi hanya di web dulu).
- Tidak ada harga per m² untuk `biaya_subkontrak` (biaya vendor tetap flat /
  diisi manual di Rincian Internal).

## Verifikasi

- `npm run type-check` (0 error) → `npm run build`.
- `npm run check:versions` (migration triple-sync).
- Jest opsional (tidak menyentuh service keuangan/inventori).
- Uji manual: buat maklon berdimensi di Katalog Extra & POS ad-hoc, tambahkan
  ke keranjang, cek total = lebar × panjang × jumlah × harga/m², checkout.
