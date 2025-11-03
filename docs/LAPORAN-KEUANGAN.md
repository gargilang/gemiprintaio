# Fitur Laporan Keuangan GemiPrint

## Overview

Sistem laporan keuangan terintegrasi dengan fitur tutup buku yang memungkinkan generate PDF laporan dengan branding GemiPrint.

## Fitur

- ✅ **Laporan Keuangan**: Generate PDF dari arsip tutup buku
- 🚧 **Laporan Inventori**: Coming soon
- 🚧 **Laporan POS**: Coming soon
- 🚧 **Laporan Hutang & Piutang**: Coming soon

## Cara Penggunaan

### 1. Persiapan

Pastikan sudah ada data arsip dari tutup buku di halaman "Buku Keuangan":

1. Buka halaman **Buku Keuangan**
2. Klik tombol **Tutup Buku**
3. Pilih periode dan beri label (contoh: "Oktober 2024")
4. Arsip akan tersimpan

### 2. Generate Laporan

1. Buka halaman **Laporan**
2. Pilih jenis laporan: **Laporan Keuangan**
3. Pilih periode/arsip yang ingin dilaporkan
4. Klik **Download Laporan PDF**
5. PDF akan otomatis terunduh

## Isi Laporan PDF

### Header

- Logo GemiPrint
- Judul laporan
- Label periode
- Informasi tanggal cetak

### Ringkasan Keuangan

- Saldo Akhir
- Total Omzet
- Biaya Operasional
- Biaya Bahan
- Laba Bersih

### Kasbon Karyawan

- Kasbon Anwar
- Kasbon Suri
- Kasbon Cahaya
- Kasbon Dinil

### Bagi Hasil Partner

- Bagi Hasil Anwar
- Bagi Hasil Suri
- Bagi Hasil Gemi

### Detail Transaksi

Tabel lengkap semua transaksi dalam periode:

- Tanggal
- Kategori
- Debit
- Kredit
- Keperluan
- Saldo Running

## Design Branding

PDF menggunakan brand colors GemiPrint:

- **Primary (Purple)**: #8B5CF6
- **Secondary (Pink)**: #EC4899
- **Tertiary (Blue)**: #3B82F6
- **Dark**: #0a1b3d

## Technical Stack

- **jsPDF**: PDF generation
- **jspdf-autotable**: Table formatting
- **Next.js API Routes**: Server-side PDF generation
- **SQLite**: Data source dari arsip

## Akses

Hanya untuk role:

- ✅ Admin
- ✅ Manager
- ❌ User biasa

## File Terkait

- `src/app/reports/page.tsx` - UI halaman laporan
- `src/app/api/reports/financial/route.ts` - API generate PDF
- `src/types/jspdf-autotable.d.ts` - Type definitions
