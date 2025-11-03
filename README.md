# gemiprint - Sistem Manajemen Percetakan

Program internal untuk mengelola bisnis percetakan dengan fitur lengkap untuk POS, inventori, dan manajemen keuangan.

## ⚡ Arsitektur Hybrid Offline-First

**NEW!** Sistem sekarang menggunakan **dual database**:

- 🔵 **SQLite (Lokal)** - Super cepat, selalu available, tidak butuh internet
- ☁️ **Supabase (Cloud)** - Backup otomatis, remote access, disaster recovery

### Keuntungan:

- ✅ **Lightning Fast** - Transaksi < 10ms (no network latency)
- ✅ **100% Uptime** - Bekerja tanpa internet
- ✅ **Auto Backup** - Sync ke cloud setiap 2 jam
- ✅ **Safe & Secure** - Data aman di 2 tempat

**Quick Start**: [OFFLINE_QUICK_START.md](OFFLINE_QUICK_START.md)

## 🚀 Quick Start

**This project is pre-configured and ready to use!**

See [QUICKSTART.md](QUICKSTART.md) for step-by-step setup instructions (5 minutes to get started).

## Fitur Utama

### 1. Autentikasi & Manajemen User

- **Login Internal dengan Username** (bukan email)
- Role-based access control: Admin, Manager, User
- Manajemen user lengkap (tambah, edit, hapus, aktif/nonaktif)
- Hanya Admin yang bisa mengelola user
- Design login profesional dan modern

### 2. POS (Point of Sale) / Kasir **[OFFLINE-FIRST]**

- Interface kasir yang mudah digunakan
- **Super cepat** - Database lokal, no lag
- Pencarian bahan yang cepat
- Support untuk pelanggan member dengan harga khusus
- Perhitungan otomatis kembalian
- Generate nomor invoice otomatis
- Update stok real-time
- **Bekerja tanpa internet**

### 3. Manajemen Data Bahan **[OFFLINE-FIRST]**

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

## Import & Kelola Cash Book

Sistem menyediakan UI yang user-friendly untuk mengelola data Cash Book (Buku Kas).

### 📥 Import dari Google Sheets (CSV)

Buka halaman **Keuangan** dan gunakan tombol **Import CSV** di toolbar (antara Kasbon Karyawan dan Table).

**Format CSV yang Didukung:**

1. Ekspor dari Google Sheets: File → Download → CSV
2. Header kolom yang diperlukan:
   - TANGGAL, KATEGORI, DEBIT, KREDIT, KEPERLUAN
3. **Format tanggal otomatis dideteksi:**
   - `MM/DD/YYYY` (Google Sheets default: 10/15/2025)
   - `DD/MM/YYYY` (Format Eropa: 15/10/2025)
   - `YYYY-MM-DD` (ISO format)
   - Tahun 2 digit didukung (25 → 2025)
4. **Format currency otomatis dibersihkan:**
   - `Rp5,085,464` (dengan prefix Rp)
   - `5.085.464` (Indonesia: titik sebagai ribuan)
   - `5.085.464,50` (Indonesia: koma sebagai desimal)
   - `5,085,464.50` (US: koma sebagai ribuan)

**Kolom terhitung otomatis** (tidak perlu ada di CSV):

- Omzet, Biaya Operasional, Biaya Bahan, Saldo, Laba Bersih
- Kasbon (Anwar, Suri, Cahaya, Dinil)
- Bagi Hasil (Anwar, Suri, Gemi)

### ↕️ Drag & Drop untuk Reorder

**PENTING untuk Kalkulasi yang Benar:**

- Transaksi seperti "Sisa Kas Bulan Lalu" harus berada di urutan yang tepat
- Klik dan drag row (⋮⋮) untuk mengubah urutan
- System akan auto-recalculate setelah reorder
- Urutan menentukan running balance/saldo yang benar

### 🔧 Edit Manual (Override)

Klik tombol **Edit Manual** (ikon 🎛️) pada transaksi untuk:

- Override nilai kolom terhitung secara manual
- Nilai yang di-override tidak akan dihitung ulang otomatis
- Visual indicator 🔒 menunjukkan kolom yang sudah di-override

### � Tutup Buku

Arsipkan transaksi periode tertentu:

1. Klik tombol **Tutup Buku**
2. Pilih tanggal mulai dan akhir
3. Beri label (contoh: "Oktober 2025")
4. Transaksi yang ditutup buku tidak muncul di tabel utama

### 📅 Pilih Bulan

Lihat transaksi yang sudah di-archive:

1. Klik tombol **Pilih Bulan**
2. Pilih periode yang ingin dilihat
3. System akan menampilkan transaksi periode tersebut

### �🗑️ Delete All Data

Gunakan tombol **Delete All** untuk menghapus semua transaksi cash_book.

**PENTING:**

- ✅ Hanya menghapus tabel `cash_book`
- ✅ Data lain tetap aman: users, materials, customers, vendors, invoices
- ⚠️ Aksi tidak bisa dibatalkan - konfirmasi diperlukan

### ⚙️ Migrasi Database (PENTING - Harus Dijalankan!)

**Sebelum menggunakan fitur-fitur baru, jalankan migrasi berikut:**

1. **Migrasi Profiles** (jika mengalami error foreign key):

```powershell
npm run db:migrate-profiles
```

2. **Migrasi Override Flags** (untuk Edit Manual):

```powershell
npm run db:migrate-override
```

3. **Migrasi Archive & Drag Drop** (untuk Tutup Buku & Reorder):

```powershell
npm run db:migrate-archive
```

**Catatan:** Migrasi hanya perlu dijalankan **sekali saja**. Jika sudah pernah dijalankan, tidak perlu dijalankan lagi.

## Dokumentasi

- [QUICKSTART.md](QUICKSTART.md) - Setup cepat (mulai di sini!)
- [SETUP.md](SETUP.md) - Panduan lengkap setup
- [DOCUMENTATION.md](DOCUMENTATION.md) - Dokumentasi API dan database
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Ringkasan proyek
- [CURRENCY_GUIDE.md](guidesmd/CURRENCY_GUIDE.md) - 💰 Panduan mata uang Rupiah (IDR)

## 💰 Mata Uang

Sistem ini **HANYA menggunakan Rupiah (IDR)**:

- Format: `Rp 1.234.567`
- Locale: `id-ID`
- Decimal: 2 digit (contoh: Rp 1.234,50)
- Lihat [CURRENCY_GUIDE.md](guidesmd/CURRENCY_GUIDE.md) untuk detail lengkap

## Status

✅ **Configured & Ready** - Project sudah terkonfigurasi dengan Supabase project "gemiprint"
