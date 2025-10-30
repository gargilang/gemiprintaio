# Panduan Setup GemiPrintaIO

Panduan lengkap untuk mengatur dan menjalankan aplikasi GemiPrintaIO.

## Prerequisites

- Node.js versi 20 atau lebih tinggi
- NPM atau Yarn
- Akun Supabase (gratis tersedia di https://supabase.com)

## Langkah-langkah Setup

### 1. Clone Repository

```bash
git clone https://github.com/gargilang/gemiprintaio.git
cd gemiprintaio
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Supabase

#### 3.1. Buat Project Supabase

1. Kunjungi https://supabase.com dan sign up/login
2. Klik "New Project"
3. Isi detail project:
   - Name: gemiprintaio (atau nama lain)
   - Database Password: (buat password yang kuat)
   - Region: pilih yang terdekat (misalnya: Southeast Asia)
4. Tunggu project selesai dibuat (sekitar 2 menit)

#### 3.2. Setup Database Schema

1. Buka project Supabase yang baru dibuat
2. Klik menu "SQL Editor" di sidebar kiri
3. Klik "New query"
4. Copy seluruh isi file `supabase/schema.sql` dari repository
5. Paste ke SQL Editor
6. Klik "Run" untuk menjalankan query
7. Tunggu hingga selesai (akan membuat semua tabel, indexes, dan policies)

#### 3.3. Dapatkan API Credentials

1. Buka menu "Settings" > "API" di Supabase dashboard
2. Copy nilai berikut:
   - **Project URL** (di bagian "Project URL")
   - **anon/public key** (di bagian "Project API keys")

### 4. Setup Environment Variables

1. Copy file `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` dan isi dengan credentials Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Membuat User Admin Pertama

#### 5.1. Buat User di Supabase Auth

1. Buka Supabase dashboard
2. Klik menu "Authentication" > "Users"
3. Klik "Add user" > "Create new user"
4. Isi:
   - Email: admin@example.com (atau email Anda)
   - Password: (buat password yang kuat)
5. Klik "Create user"
6. **Copy User ID** yang baru dibuat (akan digunakan di langkah berikutnya)

#### 5.2. Tambahkan Profile dengan Role Admin

1. Kembali ke SQL Editor
2. Jalankan query berikut (ganti `user-id-anda` dengan User ID dari langkah sebelumnya):

```sql
INSERT INTO public.profiles (id, email, full_name, role)
VALUES (
  'user-id-anda',
  'admin@example.com',
  'Admin Utama',
  'admin'
);
```

3. Klik "Run"

### 6. Jalankan Aplikasi

```bash
npm run dev
```

Aplikasi akan berjalan di http://localhost:3000

### 7. Login

1. Buka browser di http://localhost:3000
2. Anda akan diarahkan ke halaman login
3. Login dengan:
   - Email: admin@example.com (atau email yang Anda buat)
   - Password: (password yang Anda buat)
4. Setelah berhasil, Anda akan masuk ke Dashboard

## Testing Aplikasi

### 1. Test Material Management

1. Klik menu "Data Bahan" di dashboard
2. Klik "Tambah Bahan"
3. Isi form dengan data test:
   - Nama: Kertas HVS A4
   - Satuan: rim
   - Harga Beli: 50000
   - Harga Jual: 65000
   - Harga Member: 60000
   - Stok Awal: 100
4. Klik "Simpan"

### 2. Test Customer Management

1. Klik menu "Pelanggan"
2. Tambah pelanggan perorangan dan PT
3. Aktifkan status member untuk salah satu pelanggan

### 3. Test POS

1. Klik menu "POS/Kasir"
2. Pilih pelanggan (untuk test member pricing)
3. Klik material untuk menambahkan ke keranjang
4. Isi jumlah bayar
5. Klik "Bayar" untuk menyelesaikan transaksi
6. Cek stok material berkurang otomatis

### 4. Test Finance

1. Klik menu "Keuangan"
2. Tambah transaksi hutang, piutang, atau kasbon
3. Test mark as paid functionality

### 5. Test Reports

1. Klik menu "Laporan"
2. Pilih periode
3. Klik "Generate Laporan"
4. Verifikasi data penjualan, inventori, dan keuangan

## Troubleshooting

### Error: "supabaseUrl is required"

- Pastikan file `.env.local` sudah dibuat dan berisi credentials yang benar
- Restart development server setelah mengubah environment variables

### Error: "Failed to fetch"

- Pastikan Supabase project aktif
- Cek URL dan API key sudah benar
- Pastikan database schema sudah di-setup

### Login Gagal

- Pastikan user sudah dibuat di Supabase Auth
- Pastikan profile sudah ditambahkan ke tabel `profiles`
- Cek password benar

### Halaman Blank/Error

- Buka browser console (F12) untuk melihat error detail
- Pastikan semua dependencies ter-install dengan benar
- Coba hapus folder `.next` dan `node_modules`, lalu install ulang

## Deployment ke Production

### Deploy ke Vercel (Recommended)

1. Push code ke GitHub
2. Buka https://vercel.com
3. Click "New Project"
4. Import repository dari GitHub
5. Tambahkan Environment Variables di Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Klik "Deploy"

### Setup Domain (Optional)

1. Beli domain dari registrar (Namecheap, GoDaddy, dll)
2. Di Vercel, buka project > Settings > Domains
3. Tambahkan domain Anda
4. Update DNS records di registrar sesuai instruksi Vercel

## Security Notes

- **Jangan commit** file `.env.local` ke Git
- Gunakan **strong passwords** untuk Supabase dan user accounts
- Aktifkan **2FA** di akun Supabase
- Untuk production, pertimbangkan setup **custom SMTP** untuk email
- Review dan update **RLS policies** sesuai kebutuhan bisnis

## Fitur Tambahan yang Bisa Dikembangkan

- Export laporan ke PDF/Excel
- Notifikasi stok rendah via email
- Dashboard analytics dengan charts
- Barcode scanner untuk POS
- Multi-currency support
- Backup otomatis database
- Audit logs untuk tracking perubahan

## Support

Jika ada pertanyaan atau masalah:
1. Cek dokumentasi ini terlebih dahulu
2. Buat issue di GitHub repository
3. Hubungi developer

## Update Aplikasi

Untuk mendapatkan update terbaru:

```bash
git pull origin main
npm install
npm run build
```

Pastikan backup database sebelum update!
