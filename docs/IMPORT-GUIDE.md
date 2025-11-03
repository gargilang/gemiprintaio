# Import CSV dari Google Sheets - Panduan Lengkap

## Persiapan di Google Sheets

1. Pastikan kolom-kolom berikut ada di spreadsheet Anda:
   - **B: TANGGAL** (format MM/DD/YYYY dari Google Sheets akan otomatis terbaca)
   - **C: KATEGORI** (KAS, BIAYA, OMZET, INVESTOR, dll.)
   - **D: DEBIT** (angka, boleh dengan format Rp)
   - **E: KREDIT** (angka, boleh dengan format Rp)
   - **F: KEPERLUAN** (keterangan transaksi)

2. Kolom G-R (omzet, biaya operasional, kasbon, bagi hasil) **tidak perlu** diexport karena akan dihitung ulang otomatis.

## Cara Export dari Google Sheets

1. Buka Google Sheets Anda
2. Klik **File** → **Download** → **Comma-separated values (.csv)**
3. File akan terdownload dengan nama seperti `Buku Kas - Sheet1.csv`
4. Simpan di lokasi yang mudah diakses (misalnya `D:\Downloads\`)

## Langkah-langkah Import

### 1. Hapus Data Lama (jika perlu mengulang impor)

```powershell
npm run db:clear
```

Script akan meminta konfirmasi dengan mengetik `DELETE ALL` (case-sensitive).

**⚠️ PERHATIAN:** Tindakan ini tidak bisa di-undo!

### 2. Import CSV

**Mode 1: Truncate & Import (hapus semua data lama, lalu import)**

```powershell
npm run db:import-csv -- "D:\Downloads\Buku Kas - Sheet1.csv"
```

**Mode 2: Append (tambahkan data tanpa menghapus yang ada)**

```powershell
npm run db:import-csv -- "D:\Downloads\Buku Kas - Sheet1.csv" -- --append
```

**Mode 3: Dry Run (test tanpa mengubah database)**

```powershell
npm run db:import-csv -- "D:\Downloads\Buku Kas - Sheet1.csv" -- --dry-run
```

### 3. Verifikasi Hasil

```powershell
npm run db:check
```

Script ini akan menampilkan:
- Total transaksi
- Detail setiap transaksi dengan nilai-nilai terhitung
- Summary entry terakhir (saldo, laba bersih, kasbon, bagi hasil)

### 4. Re-kalkulasi Manual (jika diperlukan)

Jika Anda menambah/edit data manual melalui aplikasi dan ingin recalculate semua formula:

```powershell
npm run db:recalc
```

## Format Data yang Didukung

### Tanggal
- ✅ `10/15/2025` (MM/DD/YYYY - Google Sheets default)
- ✅ `15/10/2025` (DD/MM/YYYY - format Eropa)
- ✅ `2025-10-15` (ISO format)
- ✅ `10-15-2025` (dengan dash)
- ✅ `10/15/25` (tahun 2 digit)

Parser akan otomatis mendeteksi format.

### Angka (Debit/Kredit)
- ✅ `Rp5,085,464` (dengan prefix Rp)
- ✅ `5.085.464` (format Indonesia)
- ✅ `5.085.464,50` (dengan desimal)
- ✅ `5,085,464.50` (format US)
- ✅ `1000` atau `1.000` atau `1,000`

Parser akan otomatis membersihkan format dan mendeteksi pemisah ribuan vs desimal.

### Kategori
Harus salah satu dari:
- `KAS`, `BIAYA`, `OMZET`, `INVESTOR`, `SUBSIDI`, `LUNAS`
- `SUPPLY`, `LABA`, `KOMISI`, `TABUNGAN`, `HUTANG`, `PIUTANG`
- `PRIBADI-A`, `PRIBADI-S`

Spasi akan otomatis diubah ke dash (misal: "PRIBADI A" → "PRIBADI-A").

## Troubleshooting

### Error: "no such table: main.profiles_old"

Jalankan migrasi database sekali saja:

```powershell
npm run db:migrate-profiles
```

### Tanggal tidak terbaca dengan benar

Pastikan format di CSV adalah MM/DD/YYYY atau DD/MM/YYYY. Jika ada format custom, hubungi developer.

### Nilai debit/kredit menjadi 0

Pastikan nilai di CSV berupa angka atau format currency yang valid (Rp5,085,464). Jika ada format khusus, cek dengan dry-run terlebih dahulu.

### Import error dengan banyak invalid rows

Jalankan dengan `--dry-run` untuk melihat baris mana yang invalid:

```powershell
npm run db:import-csv -- "path\to\file.csv" -- --dry-run
```

Script akan menampilkan contoh error untuk 5 baris pertama yang invalid.

## Contoh Alur Kerja Lengkap

```powershell
# 1. Cek data yang ada saat ini
npm run db:check

# 2. Backup/hapus data lama (jika perlu)
npm run db:clear
# Ketik: DELETE ALL

# 3. Test import dengan dry-run
npm run db:import-csv -- "D:\Downloads\buku-kas-2025.csv" -- --dry-run

# 4. Jika test OK, jalankan import sesungguhnya
npm run db:import-csv -- "D:\Downloads\buku-kas-2025.csv"

# 5. Verifikasi hasil
npm run db:check
```

## Pertanyaan Lanjut

Jika ada masalah atau format data yang tidak didukung, silakan hubungi developer dengan menyertakan:
1. Screenshot/contoh isi CSV (3-5 baris pertama)
2. Error message yang muncul
3. Output dari dry-run
