# Laporan Keuangan ikut Engine AST — Design

Tanggal: 2026-06-11

## Masalah

Halaman `/laporan` dibuat sebelum engine AST buku kas ada. Akibatnya kartu
ringkasan uang menghitung ulang dari tabel sumber (penjualan POS + HPP item),
bukan membaca kolom hasil engine AST (`omzet`, `biaya_operasional`,
`biaya_bahan`, `laba_bersih`) yang sama dengan halaman Keuangan.

Gejala saat owner input data bulan lalu manual ke buku kas (bukan lewat POS):
- Kartu **Omzet** = Rp 0 (tabel `penjualan` kosong), nominal malah cuma terbaca KAS.
- Kartu **Laba Bersih** minus (omzet 0 − biaya).
- Kartu **Total Biaya** salah (hanya kategori BIAYA/TABUNGAN/KOMISI + HPP penjualan).

Padahal tabel detail per-baris sudah benar karena membaca kolom AST per baris.

Dua masalah tambahan:
- Teks `MetricCard` tidak terbaca di dark mode (latar `bg-*-50` tetap pucat,
  label teks terang). Berlaku di semua jenis laporan.
- Tabel laporan menampilkan kode kategori mentah (`PINJAMAN_KARYAWAN`) bukan
  display name (`Pinjaman Karyawan`).

## Keputusan

Kartu uang laporan **membaca kolom hasil engine AST** (buku besar = sumber
kebenaran). Ini standar akuntansi profesional: laporan adalah cerminan ledger,
bukan jalur hitung paralel.

## Fakta teknis kunci

Kolom `omzet`, `biaya_operasional`, `biaya_bahan`, `saldo`, `laba_bersih` di
tabel `keuangan` adalah **running total kumulatif** sepanjang seluruh buku kas
aktif (urut `urutan_tampilan`, lalu `dibuat_pada`). Nilai baris terakhir =
total kumulatif sejak awal waktu, BUKAN total per-periode.

Maka angka periode dihitung sebagai **delta kumulatif**:

```
nilai_periode = nilai_kumulatif(baris terakhir ≤ endDate)
              − nilai_kumulatif(baris terakhir < startDate)
```

Berlaku untuk omzet, biaya_operasional, biaya_bahan. Laba bersih periode =
omzet_periode − (biaya_operasional_periode + biaya_bahan_periode), identik
rumus `K` engine.

## Perubahan

### 1. reports-service.ts — getFormalAccountingReport

Tambah helper `cumulativeAtOrBefore(rows, col, dateKey)` yang mengembalikan
nilai kolom kumulatif dari baris aktif terakhir dengan tanggal ≤ dateKey
(urut `urutan_tampilan`, `dibuat_pada`). Hitung:

- `omzetPeriode = cum(omzet, end) − cumStrictBefore(omzet, start)`
- `biayaOpsPeriode`, `biayaBahanPeriode` cara sama
- `cashReport.omzet/operationalExpenses/cogs/netProfit` pakai angka ini
- `profitLoss.revenue/cogs/operationalExpenses/grossProfit/netProfit` pakai angka ini

`saldo` akhir tetap (sudah benar). Persediaan, Margin Penjualan, Hutang &
Piutang tidak diubah (memang dari data sumber).

Tabel `salesMargin` (faktur per penjualan) tetap dari item penjualan — itu
laporan margin POS, beda peruntukan dari kartu laba rugi buku kas.

### 2. Display name kategori

Service memuat konfigurasi kategori (`listFinanceCategories`), kirim map
`category_code → display_name` ke laporan. Baris tabel tampilkan display name,
fallback `humanizeKategoriKode`.

### 3. Dark mode MetricCard

Tiap warna kartu diberi pasangan dark lengkap (latar `dark:bg-*-900/20`,
border `dark:border-*-800/40`, nilai teks kontras). Label pakai
`text-slate-600 dark:text-slate-300`. Berlaku semua jenis laporan.

## Verifikasi

`npm run type-check` → `npm run build` → `npx jest reports` (test baru untuk
delta kumulatif).

## Di luar lingkup

Halaman cetak arsip `/laporan/financial/print` (jalur `getFinancialReport`,
output putih untuk print) tidak disentuh.

