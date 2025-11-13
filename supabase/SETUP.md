# Setup Supabase untuk Sinkronisasi Database

## 📋 Ringkasan

Aplikasi gemiprint menggunakan **dual-database strategy**:

- **SQLite lokal** sebagai database utama (offline-first)
- **Supabase (PostgreSQL)** sebagai cloud backup dan remote access

## 🎯 Tujuan Sinkronisasi

1. **Users di lokasi** → Selalu gunakan SQLite lokal (cepat, tidak butuh internet)
2. **Auto-sync** → Setiap 20 menit, data baru disync ke Supabase
3. **Remote access** → Anda dari lokasi lain bisa pull data dari Supabase
4. **Conflict resolution** → Menggunakan `sync_version` untuk resolve konflik

## 🚀 Langkah Setup

### 1. Buat Akun Supabase

1. Buka [https://supabase.com](https://supabase.com)
2. Sign up / Login
3. Klik **"New Project"**
4. Isi detail:
   - **Name**: `gemiprint-db` (atau nama lain)
   - **Database Password**: Buat password kuat (simpan baik-baik!)
   - **Region**: Pilih Singapore atau terdekat
   - **Pricing Plan**: Free tier cukup untuk start

### 2. Jalankan Schema SQL

1. Setelah project selesai dibuat, buka **SQL Editor** di sidebar
2. Klik **"New query"**
3. Copy seluruh isi file `/supabase/schema.sql`
4. Paste ke SQL Editor
5. Klik **"Run"** atau tekan `Ctrl+Enter`
6. Tunggu sampai selesai (akan ada notifikasi "Success")

### 3. Dapatkan API Credentials

1. Buka **Project Settings** (icon gear di sidebar bawah)
2. Pilih **API** di sidebar settings
3. Copy informasi berikut:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUz...` (panjang)
   - **service_role key**: `eyJhbGciOiJIUz...` (lebih panjang, RAHASIA!)

### 4. Konfigurasi di Aplikasi

Buat file `.env.local` di root project:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUz...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUz...

# Sync Configuration
SYNC_INTERVAL_MINUTES=20
ENABLE_AUTO_SYNC=true
```

**⚠️ PENTING**:

- Jangan commit `.env.local` ke Git!
- `.env.local` sudah ada di `.gitignore`
- `service_role key` sangat rahasia, jangan share!

## 📊 Struktur Kolom Sync

Setiap tabel sekarang memiliki 3 kolom tambahan:

| Kolom            | Tipe        | Keterangan                                                                    |
| ---------------- | ----------- | ----------------------------------------------------------------------------- |
| `sync_status`    | TEXT        | `'pending'` (belum sync), `'synced'` (sudah sync), `'conflict'` (ada konflik) |
| `last_synced_at` | TIMESTAMPTZ | Kapan terakhir kali record ini di-sync                                        |
| `sync_version`   | INTEGER     | Version number untuk conflict resolution                                      |

## 🔄 Cara Kerja Sync

### Auto-Sync (Setiap 20 Menit)

```
SQLite Lokal                    Supabase Cloud
┌──────────────┐               ┌──────────────┐
│ Data Baru    │               │              │
│ sync_status: │──── Push ────→│ Data Tersync │
│ 'pending'    │               │ sync_status: │
│              │               │ 'synced'     │
└──────────────┘               └──────────────┘
```

### Manual Pull (Untuk Remote Access)

```
SQLite Remote                  Supabase Cloud
┌──────────────┐               ┌──────────────┐
│              │               │ Data Terbaru │
│ Data Lama    │←──── Pull ────│ dari Users   │
│              │               │              │
└──────────────┘               └──────────────┘
```

### Conflict Resolution

Jika ada 2 perubahan berbeda pada record yang sama:

1. **Compare `sync_version`** → Versi lebih tinggi menang
2. **Compare `diperbarui_pada`** → Waktu lebih baru sebagai fallback
3. **Mark as conflict** → Jika tidak bisa resolve, set `sync_status = 'conflict'` untuk review manual

## 🔐 Row Level Security (Optional)

Untuk keamanan lebih baik, aktifkan RLS di Supabase:

```sql
-- Enable RLS untuk tabel profil
ALTER TABLE profil ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa lihat data sendiri
CREATE POLICY "Users can view own data" ON profil
  FOR SELECT USING (auth.uid() = id);

-- Policy: Admin bisa lihat semua
CREATE POLICY "Admins can view all data" ON profil
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'admin'
  );
```

## 📝 Catatan Penting

### ✅ Yang Sudah Selesai

- [x] Kolom sync sudah ditambahkan ke semua tabel (23 tabel)
- [x] Index untuk `sync_status` sudah dibuat
- [x] Schema SQLite utama sudah update
- [x] Schema Supabase PostgreSQL sudah siap
- [x] Triggers untuk auto-update `diperbarui_pada` di Supabase

### ⏳ Yang Perlu Dilakukan Berikutnya

1. **Buat Supabase Client** (`/src/lib/supabase.ts`)
2. **Buat Sync Service** (`/src/lib/sync-service.ts`)
3. **Tambah Auto-Sync Worker** (background task setiap 20 menit)
4. **Buat UI untuk Sync Status** (di Settings atau Dashboard)
5. **Testing Sync** (insert data → tunggu → cek Supabase)

## 🆘 Troubleshooting

### Error: "relation does not exist"

→ Schema belum dijalankan di Supabase. Ulangi langkah 2.

### Error: "duplicate key value"

→ Ada data dengan ID sama. Gunakan UUID unik untuk setiap record.

### Sync tidak jalan

→ Cek `.env.local` sudah benar, cek koneksi internet.

### Conflict terus muncul

→ Review manual data yang conflict, pilih mana yang benar.

## 📚 Resources

- [Supabase Docs](https://supabase.com/docs)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Sync Patterns](https://supabase.com/docs/guides/realtime)

---

**Status**: ✅ Schema Ready - Siap untuk Setup Supabase!
