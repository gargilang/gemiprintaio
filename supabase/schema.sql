-- SUPABASE SCHEMA FOR GEMIPRINT
-- Generated: 2025-11-13
-- PostgreSQL Schema for Supabase Sync
--
-- This schema is designed to sync with SQLite local database
-- All tables include sync tracking columns:
-- - sync_status: 'pending' | 'synced' | 'conflict'
-- - last_synced_at: timestamp of last successful sync
-- - sync_version: integer version for conflict resolution
--
-- Usage:
-- 1. Create a new Supabase project
-- 2. Run this schema in the SQL Editor
-- 3. Configure RLS policies as needed
--

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MASTER DATA TABLES
-- ============================================================================

-- Table: kategori_barang (Material Categories)
CREATE TABLE IF NOT EXISTS kategori_barang (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  butuh_spesifikasi_status INTEGER DEFAULT 0,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_kategori_barang_nama ON kategori_barang(nama);
CREATE INDEX IF NOT EXISTS idx_kategori_barang_sync_status ON kategori_barang(sync_status);

-- Table: subkategori_barang (Material Subcategories)
CREATE TABLE IF NOT EXISTS subkategori_barang (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  nama TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subkategori_barang_kategori ON subkategori_barang(kategori_id);
CREATE INDEX IF NOT EXISTS idx_subkategori_barang_nama ON subkategori_barang(nama);
CREATE INDEX IF NOT EXISTS idx_subkategori_barang_sync_status ON subkategori_barang(sync_status);

-- Table: satuan_barang (Material Units)
CREATE TABLE IF NOT EXISTS satuan_barang (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_satuan_barang_nama ON satuan_barang(nama);
CREATE INDEX IF NOT EXISTS idx_satuan_barang_sync_status ON satuan_barang(sync_status);

-- Table: spesifikasi_cepat_barang (Quick Specifications)
CREATE TABLE IF NOT EXISTS spesifikasi_cepat_barang (
  id TEXT PRIMARY KEY,
  kategori_id TEXT NOT NULL,
  tipe_spesifikasi TEXT NOT NULL,
  nilai_spesifikasi TEXT NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_spesifikasi_cepat_kategori ON spesifikasi_cepat_barang(kategori_id);
CREATE INDEX IF NOT EXISTS idx_spesifikasi_cepat_barang_sync_status ON spesifikasi_cepat_barang(sync_status);

-- Table: barang (Materials/Products)
CREATE TABLE IF NOT EXISTS barang (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  deskripsi TEXT,
  kategori_id TEXT,
  subkategori_id TEXT,
  satuan_dasar TEXT NOT NULL,
  spesifikasi TEXT,
  jumlah_stok REAL DEFAULT 0,
  level_stok_minimum REAL DEFAULT 0,
  lacak_inventori_status INTEGER DEFAULT 1,
  butuh_dimensi_status INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  frekuensi_terjual INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
  FOREIGN KEY (subkategori_id) REFERENCES subkategori_barang(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_barang_sync_status ON barang(sync_status);

-- Table: harga_barang_satuan (Material Unit Prices)
CREATE TABLE IF NOT EXISTS harga_barang_satuan (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL,
  harga_beli REAL DEFAULT 0,
  harga_jual REAL DEFAULT 0,
  harga_member REAL DEFAULT 0,
  default_status INTEGER DEFAULT 0,
  urutan_tampilan INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
  UNIQUE(barang_id, nama_satuan)
);

CREATE INDEX IF NOT EXISTS idx_harga_barang_satuan_sync_status ON harga_barang_satuan(sync_status);

-- Table: opsi_finishing (Finishing Options)
CREATE TABLE IF NOT EXISTS opsi_finishing (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL UNIQUE,
  urutan_tampilan INTEGER DEFAULT 0,
  aktif_status INTEGER DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_opsi_finishing_aktif ON opsi_finishing(aktif_status, urutan_tampilan);
CREATE INDEX IF NOT EXISTS idx_opsi_finishing_sync_status ON opsi_finishing(sync_status);

-- ============================================================================
-- PARTY TABLES (Customers, Vendors, Users)
-- ============================================================================

-- Table: pelanggan (Customers)
CREATE TABLE IF NOT EXISTS pelanggan (
  id TEXT PRIMARY KEY,
  tipe_pelanggan TEXT,
  nama TEXT NOT NULL,
  nama_perusahaan TEXT,
  npwp TEXT,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  member_status INTEGER DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pelanggan_sync_status ON pelanggan(sync_status);

-- Table: vendor (Vendors)
CREATE TABLE IF NOT EXISTS vendor (
  id TEXT PRIMARY KEY,
  nama_perusahaan TEXT NOT NULL,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  kontak_person TEXT,
  ketentuan_bayar TEXT,
  aktif_status INTEGER DEFAULT 1,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_vendor_sync_status ON vendor(sync_status);

-- Table: profil (User Profiles)
CREATE TABLE IF NOT EXISTS profil (
  id TEXT PRIMARY KEY,
  nama_pengguna TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  nama_lengkap TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'chief', 'user')),
  aktif_status INTEGER DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_profil_sync_status ON profil(sync_status);

-- Table: kredensial (Credentials)
CREATE TABLE IF NOT EXISTS kredensial (
  id TEXT PRIMARY KEY,
  pemilik_id TEXT NOT NULL,
  nama_layanan TEXT NOT NULL,
  nama_pengguna_akun TEXT NOT NULL,
  password_terenkripsi TEXT NOT NULL,
  catatan TEXT,
  privat_status INTEGER DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (pemilik_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_kredensial_owner ON kredensial(pemilik_id);
CREATE INDEX IF NOT EXISTS idx_kredensial_service ON kredensial(nama_layanan);
CREATE INDEX IF NOT EXISTS idx_kredensial_sync_status ON kredensial(sync_status);

-- ============================================================================
-- TRANSACTION TABLES (Sales & Purchases)
-- ============================================================================

-- Table: penjualan (Sales)
CREATE TABLE IF NOT EXISTS penjualan (
  id TEXT PRIMARY KEY,
  nomor_invoice TEXT UNIQUE NOT NULL,
  pelanggan_id TEXT,
  total_jumlah REAL NOT NULL,
  jumlah_dibayar REAL DEFAULT 0,
  jumlah_kembalian REAL DEFAULT 0,
  metode_pembayaran TEXT,
  kasir_id TEXT,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
  FOREIGN KEY (kasir_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_penjualan_sync_status ON penjualan(sync_status);

-- Table: item_penjualan (Sales Items)
CREATE TABLE IF NOT EXISTS item_penjualan (
  id TEXT PRIMARY KEY,
  penjualan_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT,
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
);

CREATE INDEX IF NOT EXISTS idx_item_penjualan_sync_status ON item_penjualan(sync_status);

-- Table: pembelian (Purchases)
CREATE TABLE IF NOT EXISTS pembelian (
  id TEXT PRIMARY KEY,
  nomor_pembelian TEXT UNIQUE NOT NULL,
  vendor_id TEXT,
  total_jumlah REAL NOT NULL,
  jumlah_dibayar REAL DEFAULT 0,
  metode_pembayaran TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  tanggal DATE DEFAULT CURRENT_DATE,
  nomor_faktur TEXT,
  status_pembayaran TEXT DEFAULT 'LUNAS' CHECK(status_pembayaran IN ('LUNAS', 'HUTANG', 'SEBAGIAN')),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (vendor_id) REFERENCES vendor(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_pembelian_sync_status ON pembelian(sync_status);

-- Table: item_pembelian (Purchase Items)
CREATE TABLE IF NOT EXISTS item_pembelian (
  id TEXT PRIMARY KEY,
  pembelian_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT,
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
);

CREATE INDEX IF NOT EXISTS idx_item_pembelian_sync_status ON item_pembelian(sync_status);

-- ============================================================================
-- RECEIVABLES & PAYABLES
-- ============================================================================

-- Table: piutang_penjualan (Accounts Receivable)
CREATE TABLE IF NOT EXISTS piutang_penjualan (
  id TEXT PRIMARY KEY,
  id_penjualan TEXT NOT NULL,
  jumlah_piutang REAL NOT NULL,
  jumlah_terbayar REAL DEFAULT 0,
  sisa_piutang REAL NOT NULL,
  jatuh_tempo TEXT,
  status TEXT DEFAULT 'AKTIF' CHECK(status IN ('AKTIF', 'LUNAS', 'JATUH_TEMPO', 'SEBAGIAN')),
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (id_penjualan) REFERENCES penjualan(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_piutang_penjualan_status ON piutang_penjualan(status);
CREATE INDEX IF NOT EXISTS idx_piutang_penjualan_date ON piutang_penjualan(dibuat_pada);
CREATE INDEX IF NOT EXISTS idx_piutang_penjualan_sync_status ON piutang_penjualan(sync_status);

-- Table: pelunasan_piutang (Receivable Payments)
CREATE TABLE IF NOT EXISTS pelunasan_piutang (
  id TEXT PRIMARY KEY,
  id_piutang TEXT NOT NULL,
  tanggal_bayar TEXT NOT NULL,
  jumlah_bayar REAL NOT NULL,
  metode_pembayaran TEXT DEFAULT 'CASH',
  referensi TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (id_piutang) REFERENCES piutang_penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_pelunasan_piutang_date ON pelunasan_piutang(tanggal_bayar);
CREATE INDEX IF NOT EXISTS idx_pelunasan_piutang_sync_status ON pelunasan_piutang(sync_status);

-- Table: hutang_pembelian (Accounts Payable)
CREATE TABLE IF NOT EXISTS hutang_pembelian (
  id TEXT PRIMARY KEY,
  id_pembelian TEXT NOT NULL,
  jumlah_hutang REAL NOT NULL,
  jumlah_terbayar REAL DEFAULT 0,
  sisa_hutang REAL NOT NULL,
  jatuh_tempo TEXT,
  status TEXT DEFAULT 'AKTIF' CHECK(status IN ('AKTIF', 'LUNAS', 'JATUH_TEMPO')),
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (id_pembelian) REFERENCES pembelian(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hutang_pembelian_sync_status ON hutang_pembelian(sync_status);

-- Table: pelunasan_hutang (Payable Payments)
CREATE TABLE IF NOT EXISTS pelunasan_hutang (
  id TEXT PRIMARY KEY,
  id_hutang TEXT NOT NULL,
  tanggal_bayar TEXT NOT NULL,
  jumlah_bayar REAL NOT NULL,
  metode_pembayaran TEXT DEFAULT 'CASH',
  referensi TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (id_hutang) REFERENCES hutang_pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_pelunasan_hutang_sync_status ON pelunasan_hutang(sync_status);

-- ============================================================================
-- PRODUCTION TABLES
-- ============================================================================

-- Table: order_produksi (Production Orders)
CREATE TABLE IF NOT EXISTS order_produksi (
  id TEXT PRIMARY KEY,
  penjualan_id TEXT NOT NULL,
  nomor_spk TEXT UNIQUE NOT NULL,
  pelanggan_nama TEXT,
  total_item INTEGER DEFAULT 0,
  status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PROSES', 'SELESAI', 'DIBATALKAN')),
  prioritas TEXT DEFAULT 'NORMAL' CHECK(prioritas IN ('NORMAL', 'KILAT')),
  tanggal_deadline TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  diselesaikan_pada TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_order_produksi_status ON order_produksi(status);
CREATE INDEX IF NOT EXISTS idx_order_produksi_penjualan ON order_produksi(penjualan_id);
CREATE INDEX IF NOT EXISTS idx_order_produksi_sync_status ON order_produksi(sync_status);

-- Table: item_produksi (Production Items)
CREATE TABLE IF NOT EXISTS item_produksi (
  id TEXT PRIMARY KEY,
  order_produksi_id TEXT NOT NULL,
  item_penjualan_id TEXT NOT NULL,
  barang_nama TEXT NOT NULL,
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  panjang REAL,
  lebar REAL,
  keterangan_dimensi TEXT,
  mesin_printing TEXT,
  jenis_bahan TEXT,
  status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PRINTING', 'FINISHING', 'SELESAI')),
  catatan_produksi TEXT,
  operator_id TEXT,
  mulai_proses TEXT,
  selesai_proses TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (order_produksi_id) REFERENCES order_produksi(id) ON DELETE CASCADE,
  FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_item_produksi_order ON item_produksi(order_produksi_id);
CREATE INDEX IF NOT EXISTS idx_item_produksi_status ON item_produksi(status);
CREATE INDEX IF NOT EXISTS idx_item_produksi_sync_status ON item_produksi(sync_status);

-- Table: item_finishing (Finishing Items)
CREATE TABLE IF NOT EXISTS item_finishing (
  id TEXT PRIMARY KEY,
  item_produksi_id TEXT NOT NULL,
  jenis_finishing TEXT NOT NULL,
  keterangan TEXT,
  status TEXT DEFAULT 'MENUNGGU' CHECK(status IN ('MENUNGGU', 'PROSES', 'SELESAI')),
  operator_id TEXT,
  mulai_proses TEXT,
  selesai_proses TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (item_produksi_id) REFERENCES item_produksi(id) ON DELETE CASCADE,
  FOREIGN KEY (operator_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_item_finishing_item ON item_finishing(item_produksi_id);
CREATE INDEX IF NOT EXISTS idx_item_finishing_sync_status ON item_finishing(sync_status);

-- ============================================================================
-- FINANCE TABLE
-- ============================================================================

-- Table: keuangan (Finance/Accounting)
CREATE TABLE IF NOT EXISTS keuangan (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  kategori_transaksi TEXT NOT NULL,
  debit REAL DEFAULT 0,
  kredit REAL DEFAULT 0,
  keperluan TEXT,
  omzet REAL DEFAULT 0,
  biaya_operasional REAL DEFAULT 0,
  biaya_bahan REAL DEFAULT 0,
  saldo REAL DEFAULT 0,
  laba_bersih REAL DEFAULT 0,
  kasbon_anwar REAL DEFAULT 0,
  kasbon_suri REAL DEFAULT 0,
  kasbon_cahaya REAL DEFAULT 0,
  kasbon_dinil REAL DEFAULT 0,
  bagi_hasil_anwar REAL DEFAULT 0,
  bagi_hasil_suri REAL DEFAULT 0,
  bagi_hasil_gemi REAL DEFAULT 0,
  catatan TEXT,
  dibuat_oleh TEXT,
  diarsipkan_pada TEXT,
  label_arsip TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL,
  diperbarui_pada TIMESTAMPTZ NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  override_saldo INTEGER DEFAULT 0,
  override_omzet INTEGER DEFAULT 0,
  override_biaya_operasional INTEGER DEFAULT 0,
  override_biaya_bahan INTEGER DEFAULT 0,
  override_laba_bersih INTEGER DEFAULT 0,
  override_kasbon_anwar INTEGER DEFAULT 0,
  override_kasbon_suri INTEGER DEFAULT 0,
  override_kasbon_cahaya INTEGER DEFAULT 0,
  override_kasbon_dinil INTEGER DEFAULT 0,
  override_bagi_hasil_anwar INTEGER DEFAULT 0,
  override_bagi_hasil_suri INTEGER DEFAULT 0,
  override_bagi_hasil_gemi INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_keuangan_sync_status ON keuangan(sync_status);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Function to update diperbarui_pada timestamp
CREATE OR REPLACE FUNCTION update_diperbarui_pada()
RETURNS TRIGGER AS $$
BEGIN
  NEW.diperbarui_pada = NOW();
  NEW.sync_status = 'pending';
  NEW.sync_version = OLD.sync_version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with diperbarui_pada
CREATE TRIGGER update_barang_diperbarui_pada BEFORE UPDATE ON barang FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_harga_barang_satuan_diperbarui_pada BEFORE UPDATE ON harga_barang_satuan FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_kategori_barang_diperbarui_pada BEFORE UPDATE ON kategori_barang FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_subkategori_barang_diperbarui_pada BEFORE UPDATE ON subkategori_barang FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_satuan_barang_diperbarui_pada BEFORE UPDATE ON satuan_barang FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_spesifikasi_cepat_barang_diperbarui_pada BEFORE UPDATE ON spesifikasi_cepat_barang FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_pelanggan_diperbarui_pada BEFORE UPDATE ON pelanggan FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_vendor_diperbarui_pada BEFORE UPDATE ON vendor FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_profil_diperbarui_pada BEFORE UPDATE ON profil FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_kredensial_diperbarui_pada BEFORE UPDATE ON kredensial FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_penjualan_diperbarui_pada BEFORE UPDATE ON penjualan FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_pembelian_diperbarui_pada BEFORE UPDATE ON pembelian FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_piutang_penjualan_diperbarui_pada BEFORE UPDATE ON piutang_penjualan FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_hutang_pembelian_diperbarui_pada BEFORE UPDATE ON hutang_pembelian FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_order_produksi_diperbarui_pada BEFORE UPDATE ON order_produksi FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_item_produksi_diperbarui_pada BEFORE UPDATE ON item_produksi FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_item_finishing_diperbarui_pada BEFORE UPDATE ON item_finishing FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();
CREATE TRIGGER update_opsi_finishing_diperbarui_pada BEFORE UPDATE ON opsi_finishing FOR EACH ROW EXECUTE FUNCTION update_diperbarui_pada();

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- Sync Strategy:
-- 1. Local SQLite is the primary source of truth for user operations
-- 2. Every 20 minutes, sync pending records (sync_status='pending') to Supabase
-- 3. Remote users pull from Supabase to get latest data
-- 4. Conflict resolution uses sync_version (higher version wins)
-- 5. last_synced_at tracks last successful sync timestamp
--
-- To use this schema:
-- 1. Create a Supabase project at https://supabase.com
-- 2. Copy this entire file and paste in SQL Editor
-- 3. Run the schema
-- 4. Get your API URL and anon key from Project Settings > API
-- 5. Configure in your app: /src/lib/supabase.ts
--
-- For Row Level Security (RLS):
-- - Consider adding RLS policies based on your security requirements
-- - Example: Only allow users to see their own data, admins see all
--
