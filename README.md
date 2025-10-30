# gemiprintAIO - Sistem Manajemen Percetakan

Program internal untuk mengelola bisnis percetakan dengan fitur lengkap untuk POS, inventori, dan manajemen keuangan.

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

## Setup

1. Clone dan install:
```bash
npm install
```

2. Setup Supabase dan jalankan `supabase/schema.sql`

3. Copy `.env.example` ke `.env.local` dan isi credentials

4. Run:
```bash
npm run dev
```

Lihat dokumentasi lengkap di file ini untuk detail setup dan penggunaan.
