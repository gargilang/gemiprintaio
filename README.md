# gemiprintAIO - Sistem Manajemen Percetakan

Program internal untuk mengelola bisnis percetakan dengan fitur lengkap untuk POS, inventori, dan manajemen keuangan.

## 🚀 Quick Start

**This project is pre-configured and ready to use!**

See [QUICKSTART.md](QUICKSTART.md) for step-by-step setup instructions (5 minutes to get started).

## Fitur Utama

### 1. Autentikasi & Manajemen User
- Login untuk Admin, Manager, dan User
- Role-based access control dengan Supabase
- Manajemen profil pengguna

### 2. POS (Point of Sale) / Kasir
- Interface kasir yang mudah digunakan
- Pencarian bahan yang cepat
- Support untuk pelanggan member dengan harga khusus
- Perhitungan otomatis kembalian
- Generate nomor invoice otomatis
- Update stok real-time

### 3. Manajemen Data Bahan
- CRUD lengkap untuk data bahan
- Tiga tier harga: Harga Beli, Harga Jual, Harga Member
- Tracking stok dengan peringatan stok rendah
- Berbagai satuan (kg, meter, pcs, dll)

### 4. Manajemen Pelanggan
- Data pelanggan perorangan dan PT/Perusahaan
- Status member/pelanggan setia
- Informasi kontak lengkap

### 5. Manajemen Vendor
- Data vendor/supplier dengan tracking pembelian

### 6. Manajemen Keuangan
- Hutang, Piutang, Kasbon Pegawai
- Pemasukan & Pengeluaran di luar POS
- Status pelunasan

### 7. Laporan Keuangan
- Laporan penjualan, laba kotor, inventori
- Ringkasan keuangan komprehensif

## Teknologi

- Next.js 16, TypeScript, Tailwind CSS
- Supabase (PostgreSQL + Auth)

## Setup Cepat

1. Clone dan install:
```bash
npm install
```

2. Setup database (lihat [QUICKSTART.md](QUICKSTART.md))

3. Run:
```bash
npm run dev
```

## Dokumentasi

- [QUICKSTART.md](QUICKSTART.md) - Setup cepat (mulai di sini!)
- [SETUP.md](SETUP.md) - Panduan lengkap setup
- [DOCUMENTATION.md](DOCUMENTATION.md) - Dokumentasi API dan database
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Ringkasan proyek

## Status

✅ **Configured & Ready** - Project sudah terkonfigurasi dengan Supabase project "gemiprint"
