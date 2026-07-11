# Desain: Biaya Tambahan dengan Porsi Modal (Pengeluaran)

Tanggal: 2026-07-11
Status: Disetujui (menunggu review spec tertulis)

## Latar Belakang & Masalah

Di POS, tiap item keranjang bisa punya "biaya tambahan" (baris biaya custom) —
mis. "Editing", "Ongkir Lalamove", "Ongkos pasang bambu". Saat ini **seluruh
nominal** biaya tambahan masuk ke `total_jumlah` penjualan dan tercatat penuh
sebagai **omzet** (baris keuangan `OMZET`). Cost/modal dari biaya tersebut tidak
dicatat sama sekali.

Ini keliru untuk kasus di mana sebagian/seluruh nominal sebenarnya adalah uang
yang keluar ke pihak ketiga:

- **"Editing"** → 100% jasa internal → seluruhnya omzet (sudah benar).
- **"Ongkir Lalamove" Rp20.000** → reimbursement → ditagih ke pelanggan (omzet)
  TAPI dibayar ke Lalamove (pengeluaran). Net margin ≈ 0, kas keluar harus
  tercatat.
- **"Pasang bambu" Rp30.000** → campuran: Rp15.000 beli bambu (pengeluaran),
  Rp15.000 jasa pasang (omzet murni).

## Solusi

Tambahkan satu field opsional **`modal`** per baris biaya tambahan. Porsi modal
dicatat sebagai pengeluaran kas (kategori keuangan `BIAYA`) saat transaksi
dibuat; sisanya (`nominal − modal`) tetap jadi omzet. Modal juga masuk ke
perhitungan HPP/margin item terkait.

Contoh:

| Label | Nominal | Modal | Omzet efektif | Pengeluaran |
|-------|--------:|------:|--------------:|------------:|
| Editing | 20.000 | 0 | 20.000 | 0 |
| Ongkir Lalamove | 20.000 | 20.000 | 20.000 | 20.000 (net 0) |
| Pasang bambu | 30.000 | 15.000 | 30.000 | 15.000 (margin 15.000) |

**Prinsip:** `modal` TIDAK mengubah total tagihan ke pelanggan. Total yang
dibayar pelanggan tetap = nominal penuh (dan perlakuan PPN tidak berubah).
`modal` hanya memindahkan sebagian omzet menjadi pengeluaran kas internal.

## Keputusan Desain (hasil brainstorming)

1. **Tanpa vendor.** Cost dicatat sebagai pengeluaran umum (bayar tunai/CASH),
   tanpa memilih vendor atau metode bayar. Keterangan memakai label baris.
2. **Selalu diposting saat transaksi dibuat.** Cost adalah kas keluar riil
   (mis. bayar ongkir/bambu di tempat), terlepas pelanggan bayar CASH/NET30/DP.
   Tidak ditahan mengikuti status pembayaran penjualan.
3. **Kategori `BIAYA`** (kategori keuangan yang sudah ada). Berkontribusi ke
   "Biaya Operasional" di laporan (`periode-metrics-service.ts`:
   `KATEGORI_BIAYA_OPS = {BIAYA, TABUNGAN, GAJI}`).
4. **UI:** satu field opsional "Modal" per baris (Label | Nominal | Modal).
   Kosong/0 = perilaku lama (murni omzet).
5. **Margin:** modal ditambahkan ke HPP item terkait sehingga `gross_profit`
   item akurat. Validasi: `0 <= modal <= nominal` (tidak boleh rugi per baris).

## Perubahan Teknis

### 1. Skema DB — kolom baru `modal` (iron rule 2: tiga tempat sinkron)

Tambah kolom ke `biaya_tambahan_penjualan`:

```
modal REAL NOT NULL DEFAULT 0
```

- **(a) Migrasi cloud:** `supabase/migrations/<timestamp>_biaya_tambahan_modal.sql`
  — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS modal ... DEFAULT 0` (additive).
- **(b) Template fresh-install:** `database/sqlite-schema.sql` — tambah kolom di
  definisi tabel `biaya_tambahan_penjualan`.
- **(c) Runtime migrasi SQLite:** `src/lib/db-unified.ts` — `ALTER TABLE
  biaya_tambahan_penjualan ADD COLUMN modal REAL NOT NULL DEFAULT 0` mengikuti
  pola migrasi runtime yang sudah ada di file itu (blok migrasi
  `biaya_tambahan_penjualan`).
- **(d) `supabase/schema.sql`** (snapshot skema) diperbarui agar konsisten.

Tidak perlu kolom sync tambahan (tabel sudah punya set sync lengkap).

### 2. Tipe & Validasi

- `src/app/pos/pos-types.ts`: `BiayaTambahanItem` → tambah `modal?: number`.
- Zod (`src/lib/schemas/pos.ts`): baris biaya tambahan → `modal:
  z.coerce.number().finite().min(0).optional()`. Validasi silang per baris:
  bila `modal` terisi dan `> 0`, wajib `modal <= nominal` (`.superRefine`),
  gagal → 422 via `safeParse`. Baris yang di-skip (label kosong atau
  `nominal <= 0`) tidak divalidasi modal karena tidak akan disimpan.

### 3. Alur keuangan (`src/lib/services/pos-mutations.ts`)

- Saat `db.insert("biaya_tambahan_penjualan", ...)` (jalur per-item DAN jalur
  header legacy), sertakan `modal: Number(b.modal) || 0`.
- Hitung `totalModalBiaya` = Σ `modal` dari semua baris valid (label terisi,
  `nominal > 0`, `modal >= 0`, `modal <= nominal`).
- Jika `totalModalBiaya > 0`, post SATU baris keuangan **selalu** (tidak
  bergantung `isLunas`):
  - `kategori_transaksi: "BIAYA"`
  - `debit: 0`, `kredit: totalModalBiaya`
  - `keperluan: "Biaya tambahan <invoiceNumber> [REF:<saleId>]"`
  - `reference_type: "SALE_EXTRA_COST"`, `reference_id: saleId`
  - `omzet: 0`
- Void: sudah otomatis. `voidSale` menandai VOIDED semua baris keuangan yang
  `keperluan`-nya mengandung `[REF:<saleId>]`, jadi baris `BIAYA` ini ikut
  ter-void tanpa kode tambahan.

### 4. Margin / HPP per item

- Biaya tambahan sudah tertaut ke `item_penjualan_id`. Saat menghitung
  `hpp_total`/`gross_profit`/`gross_margin` item di `createSale`, tambahkan Σ
  `modal` baris biaya tambahan milik item tersebut ke `hpp_total` item.
  Konsekuensi: `gross_profit` item = `subtotal − hpp_barang − Σ modal`.
- Untuk biaya tambahan header legacy (tanpa `item_penjualan_id`), modal tetap
  diposting ke keuangan (pengeluaran) tetapi tidak dibebankan ke item tertentu
  (tidak ada item acuan) — hanya memengaruhi keuangan, bukan margin per item.

### 5. UI POS (`src/app/pos/page.tsx`)

- Di editor baris biaya tambahan (`formBiayaTambahan`), tambah input ketiga
  "Modal" (number, opsional, kecil) di samping "Nominal". Placeholder mis.
  "Modal" / "0". State `BiayaTambahanItem` menyertakan `modal`.
- Kirim `modal` di payload checkout per baris biaya tambahan.
- Validasi ringan di klien: `modal <= nominal` (beri peringatan), server tetap
  jadi otoritas via Zod.

### 6. Tampilan

- Modal adalah info internal — TIDAK ditampilkan di struk/faktur pelanggan.
- Tidak wajib ditampilkan di riwayat/detail (boleh dilewati agar minimal). Nilai
  omzet & pengeluaran sudah tercermin di keuangan.

### 7. Testing (Jest)

Berkas: `src/lib/__tests__/` (jalur node, mock-db).

- `createSale` dengan biaya tambahan bermodal → baris keuangan `BIAYA` terbuat,
  `kredit` = Σ modal, `keperluan` mengandung `[REF:saleId]`,
  `reference_type = SALE_EXTRA_COST`.
- Biaya tambahan `modal = 0` → TIDAK ada baris `BIAYA` (perilaku lama).
- Modal diposting walau penjualan NET30 (tidak `isLunas`) — pengeluaran tetap
  masuk saat transaksi dibuat.
- Margin: `hpp_total`/`gross_profit` item memasukkan modal biaya tambahan.
- Validasi Zod: `modal > nominal` → ditolak (422).
- Void: baris keuangan `BIAYA` ikut ter-VOIDED (via `[REF:saleId]`).

## Verifikasi (Definition of Done)

- `npm run type-check` → 0 error
- `npm run build` → sukses
- `npx jest` untuk suite POS/keuangan terkait → hijau
- Migrasi diterapkan ke lokal (`supabase migration up --local`) dan cloud
  (`supabase db push`) setelah persetujuan.

## Yang TIDAK termasuk (YAGNI)

- Tidak ada pemilihan vendor / metode bayar per baris biaya tambahan.
- Tidak ada hutang (NET30) untuk cost biaya tambahan.
- Tidak ada perubahan PPN / total tagihan pelanggan.
- Tidak ada kategori keuangan baru (pakai `BIAYA` yang sudah ada).
- Tidak menampilkan modal di dokumen pelanggan.
