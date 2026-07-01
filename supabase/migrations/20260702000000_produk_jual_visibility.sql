-- supabase/migrations/20260702000000_produk_jual_visibility.sql

-- Tambah flag visibilitas POS di tabel barang (default 1 = tampil)
ALTER TABLE barang
  ADD COLUMN IF NOT EXISTS muncul_di_pos_status INTEGER NOT NULL DEFAULT 1;

-- Tambah nama custom produk pada harga satuan (NULL = fallback ke nama_satuan)
ALTER TABLE harga_barang_satuan
  ADD COLUMN IF NOT EXISTS nama_produk_jual TEXT;
