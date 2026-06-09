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
-- • Dev with CLI (preferred): `npm run supabase:link` then `npm run supabase:db:push` (migrations under supabase/migrations/).
-- • Without CLI: DATABASE_URL in .env.local → `npm run supabase:apply`, or paste this + seed-default-values.sql in SQL Editor.
-- • Keep migrations in sync: edit supabase/migrations/*.sql for new changes; copy or regenerate this file if you still need a single paste.
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
  average_cost_per_base_unit REAL DEFAULT 0,
  level_stok_minimum REAL DEFAULT 0,
  lacak_inventori_status INTEGER DEFAULT 1,
  butuh_dimensi_status INTEGER DEFAULT 0,
  roll_inventory_status INTEGER NOT NULL DEFAULT 0,
  default_location_id TEXT DEFAULT 'main',
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

CREATE TABLE IF NOT EXISTS barang_roll_variants (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL,
  lebar_m REAL NOT NULL,
  panjang_tersedia_m REAL NOT NULL DEFAULT 0,
  average_cost_per_m2 REAL NOT NULL DEFAULT 0,
  aktif_status INTEGER NOT NULL DEFAULT 1,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
  CONSTRAINT barang_roll_variants_width_positive CHECK(lebar_m > 0),
  CONSTRAINT barang_roll_variants_length_nonnegative CHECK(panjang_tersedia_m >= 0),
  CONSTRAINT barang_roll_variants_unique_width UNIQUE(barang_id, lebar_m)
);

CREATE INDEX IF NOT EXISTS idx_barang_roll_variants_barang
  ON barang_roll_variants(barang_id, aktif_status, lebar_m);

-- Table: profil (User Profiles)
CREATE TABLE IF NOT EXISTS profil (
  id TEXT PRIMARY KEY,
  nama_pengguna TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  nama_lengkap TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'staff', 'kasir', 'operator', 'user')),
  aktif_status INTEGER DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_profil_sync_status ON profil(sync_status);

-- Table: inventory_movements (Append-only inventory ledger)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  barang_id TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'SALE_ISSUE', 'SALE_VOID', 'SALE_RETURN', 'PURCHASE_VOID', 'PURCHASE_RETURN', 'ADJUSTMENT', 'WASTE', 'ROLL_CONVERSION_OUT', 'ROLL_CONVERSION_IN', 'PRODUCTION_ISSUE', 'PRODUCTION_WASTE')),
  qty_delta REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  value_delta REAL NOT NULL DEFAULT 0,
  qty_before REAL NOT NULL DEFAULT 0,
  qty_after REAL NOT NULL DEFAULT 0,
  avg_cost_before REAL NOT NULL DEFAULT 0,
  avg_cost_after REAL NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_line_id TEXT,
  reversal_of_id TEXT,
  catatan TEXT,
  dibuat_oleh TEXT,
  location_id TEXT DEFAULT 'main',
  roll_variant_id TEXT,
  roll_width_m REAL,
  linear_delta_m REAL,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements(id),
  FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id) ON DELETE SET NULL,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_location ON inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_roll_variant ON inventory_movements(roll_variant_id, dibuat_pada);

-- Table: lokasi (Multi-warehouse, default 'main')
CREATE TABLE IF NOT EXISTS lokasi (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT UNIQUE,
  alamat TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  aktif_status INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

-- Table: accounting_periods (Period close untuk laporan keuangan formal)
CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  period_key TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (closed_by) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON accounting_periods(status, start_date, end_date);

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
  alamat_npwp TEXT,
  nama_di_npwp TEXT,
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
  npwp TEXT,
  alamat_npwp TEXT,
  nama_di_npwp TEXT,
  tipe_vendor TEXT NOT NULL DEFAULT 'SUPPLIER' CHECK(tipe_vendor IN ('SUPPLIER', 'SUBKONTRAKTOR', 'KEDUANYA')),
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_vendor_sync_status ON vendor(sync_status);
CREATE INDEX IF NOT EXISTS idx_vendor_tipe ON vendor(tipe_vendor);

-- Table: pengaturan_toko (Shop settings + identitas PKP)
CREATE TABLE IF NOT EXISTS pengaturan_toko (
  id TEXT PRIMARY KEY DEFAULT 'default',
  nama_toko TEXT NOT NULL DEFAULT 'Toko',
  alamat TEXT,
  telepon TEXT,
  email TEXT,
  npwp TEXT,
  alamat_npwp TEXT,
  status_pkp INTEGER NOT NULL DEFAULT 0,
  ppn_persen_default REAL NOT NULL DEFAULT 11,
  ppn_metode_default TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode_default IN ('EKSKLUSIF', 'INKLUSIF')),
  ppn_default_aktif INTEGER NOT NULL DEFAULT 0,
  nsfp_kode_transaksi_default TEXT NOT NULL DEFAULT '01',
  nsfp_tahun_aktif TEXT,
  nsfp_seri_terakhir TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

-- Table: nsfp_pool (NSFP yang sudah dialokasikan dari Coretax)
CREATE TABLE IF NOT EXISTS nsfp_pool (
  id TEXT PRIMARY KEY,
  tahun TEXT NOT NULL,
  kode_transaksi TEXT NOT NULL DEFAULT '01',
  nomor_seri TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'TERSEDIA' CHECK(status IN ('TERSEDIA', 'TERPAKAI', 'BATAL')),
  penjualan_id TEXT,
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  UNIQUE (tahun, kode_transaksi, nomor_seri)
);

CREATE INDEX IF NOT EXISTS idx_nsfp_pool_status ON nsfp_pool(status, tahun, nomor_seri);
CREATE INDEX IF NOT EXISTS idx_nsfp_pool_penjualan ON nsfp_pool(penjualan_id);

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
  nomor_faktur TEXT UNIQUE NOT NULL,
  pelanggan_id TEXT,
  pelanggan_nama_snapshot TEXT,
  pelanggan_kota TEXT,
  total_jumlah REAL NOT NULL,
  jumlah_dibayar REAL DEFAULT 0,
  jumlah_kembalian REAL DEFAULT 0,
  metode_pembayaran TEXT,
  kasir_id TEXT,
  catatan TEXT,
  status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('DRAFT', 'POSTED', 'VOIDED')),
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  -- PPN keluaran
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  nsfp_kode_transaksi TEXT,
  nsfp_tahun TEXT,
  nsfp_nomor_seri TEXT,
  tanggal_faktur_pajak DATE,
  pelanggan_npwp_snapshot TEXT,
  pelanggan_alamat_npwp_snapshot TEXT,
  pelanggan_nama_npwp_snapshot TEXT,
  penawaran_id TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
  FOREIGN KEY (kasir_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_penjualan_sync_status ON penjualan(sync_status);
CREATE INDEX IF NOT EXISTS idx_penjualan_status_transaksi ON penjualan(status_transaksi);
CREATE INDEX IF NOT EXISTS idx_penjualan_kena_ppn ON penjualan(kena_ppn);
CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_faktur_pajak ON penjualan(tanggal_faktur_pajak);
CREATE INDEX IF NOT EXISTS idx_penjualan_penawaran ON penjualan(penawaran_id);

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
  hpp_satuan REAL DEFAULT 0,
  hpp_total REAL DEFAULT 0,
  gross_profit REAL DEFAULT 0,
  gross_margin REAL DEFAULT 0,
  panjang REAL,
  lebar REAL,
  billed_panjang REAL,
  billed_lebar REAL,
  recommended_roll_width_m REAL,
  roll_inventory_deferred INTEGER NOT NULL DEFAULT 0,
  tipe_item TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_item IN ('BARANG', 'JASA', 'MAKLON')),
  vendor_subkontrak_id TEXT,
  biaya_subkontrak REAL,
  metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH', 'NET30')),
  pembelian_id_terkait TEXT,
  deskripsi_pekerjaan TEXT,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id),
  FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_item_penjualan_sync_status ON item_penjualan(sync_status);
CREATE INDEX IF NOT EXISTS idx_item_penjualan_tipe_item ON item_penjualan(tipe_item);
CREATE INDEX IF NOT EXISTS idx_item_penjualan_pembelian_terkait ON item_penjualan(pembelian_id_terkait);

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
  diterima_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  tanggal DATE DEFAULT CURRENT_DATE,
  nomor_faktur TEXT,
  status_pembayaran TEXT DEFAULT 'LUNAS' CHECK(status_pembayaran IN ('LUNAS', 'HUTANG', 'SEBAGIAN')),
  tipe_pembelian TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_pembelian IN ('BARANG', 'MAKLON')),
  penjualan_id_sumber TEXT,
  status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('DRAFT', 'POSTED', 'VOIDED')),
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  -- PPN masukan
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dapat_dikreditkan INTEGER NOT NULL DEFAULT 1,
  nomor_faktur_pajak_vendor TEXT,
  tanggal_faktur_pajak DATE,
  vendor_npwp_snapshot TEXT,
  purchase_order_id TEXT,
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (vendor_id) REFERENCES vendor(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_pembelian_sync_status ON pembelian(sync_status);
CREATE INDEX IF NOT EXISTS idx_pembelian_penjualan_sumber ON pembelian(penjualan_id_sumber);
CREATE INDEX IF NOT EXISTS idx_pembelian_tipe ON pembelian(tipe_pembelian);
CREATE INDEX IF NOT EXISTS idx_pembelian_status_transaksi ON pembelian(status_transaksi);
CREATE INDEX IF NOT EXISTS idx_pembelian_kena_ppn ON pembelian(kena_ppn);
CREATE INDEX IF NOT EXISTS idx_pembelian_dapat_dikreditkan ON pembelian(dapat_dikreditkan);
CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_faktur_pajak ON pembelian(tanggal_faktur_pajak);
CREATE INDEX IF NOT EXISTS idx_pembelian_purchase_order ON pembelian(purchase_order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'item_penjualan_pembelian_id_terkait_fkey'
  ) THEN
    ALTER TABLE item_penjualan
      ADD CONSTRAINT item_penjualan_pembelian_id_terkait_fkey
      FOREIGN KEY (pembelian_id_terkait) REFERENCES pembelian(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pembelian_penjualan_id_sumber_fkey'
  ) THEN
    ALTER TABLE pembelian
      ADD CONSTRAINT pembelian_penjualan_id_sumber_fkey
      FOREIGN KEY (penjualan_id_sumber) REFERENCES penjualan(id) ON DELETE SET NULL;
  END IF;
END $$;

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
  panjang REAL,
  lebar REAL,
  jumlah_roll INTEGER NOT NULL DEFAULT 1,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  purchase_order_item_id TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (pembelian_id) REFERENCES pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
);

CREATE INDEX IF NOT EXISTS idx_item_pembelian_sync_status ON item_pembelian(sync_status);
CREATE INDEX IF NOT EXISTS idx_item_pembelian_po_item ON item_pembelian(purchase_order_item_id);

-- Table: penawaran (Sales quotations)
CREATE TABLE IF NOT EXISTS penawaran (
  id TEXT PRIMARY KEY,
  nomor_penawaran TEXT UNIQUE NOT NULL,
  pelanggan_id TEXT,
  pelanggan_nama_snapshot TEXT,
  pelanggan_kota TEXT,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  berlaku_sampai DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'CANCELLED', 'EXPIRED')),
  total_jumlah REAL NOT NULL DEFAULT 0,
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  dibuat_oleh TEXT,
  converted_penjualan_id TEXT,
  converted_at TIMESTAMPTZ,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
  FOREIGN KEY (converted_penjualan_id) REFERENCES penjualan(id)
);
CREATE INDEX IF NOT EXISTS idx_penawaran_status ON penawaran(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_penawaran_pelanggan ON penawaran(pelanggan_id);

-- Table: item_penawaran (Quotation items)
CREATE TABLE IF NOT EXISTS item_penawaran (
  id TEXT PRIMARY KEY,
  penawaran_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT,
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  panjang REAL,
  lebar REAL,
  tipe_item TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_item IN ('BARANG', 'JASA', 'MAKLON')),
  vendor_subkontrak_id TEXT,
  biaya_subkontrak REAL,
  metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH', 'NET30')),
  deskripsi_pekerjaan TEXT,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (penawaran_id) REFERENCES penawaran(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id),
  FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_item_penawaran_doc ON item_penawaran(penawaran_id);

-- Table: purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  nomor_po TEXT UNIQUE NOT NULL,
  vendor_id TEXT,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'SENT', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED')),
  total_jumlah REAL NOT NULL DEFAULT 0,
  kena_ppn INTEGER NOT NULL DEFAULT 0,
  ppn_persen REAL NOT NULL DEFAULT 0,
  ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (vendor_id) REFERENCES vendor(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, tanggal);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  harga_satuan_id TEXT,
  jumlah REAL NOT NULL,
  qty_received REAL NOT NULL DEFAULT 0,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  panjang REAL,
  lebar REAL,
  dpp_satuan REAL NOT NULL DEFAULT 0,
  ppn_satuan REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_doc ON purchase_order_items(purchase_order_id);

-- Table: formal sales and purchase returns
CREATE TABLE IF NOT EXISTS retur_penjualan (
  id TEXT PRIMARY KEY,
  nomor_retur TEXT UNIQUE NOT NULL,
  penjualan_id TEXT NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED', 'CANCELLED')),
  total_retur REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  total_hpp REAL NOT NULL DEFAULT 0,
  receivable_reduction REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_retur_penjualan_sale ON retur_penjualan(penjualan_id, tanggal);

CREATE TABLE IF NOT EXISTS item_retur_penjualan (
  id TEXT PRIMARY KEY,
  retur_penjualan_id TEXT NOT NULL,
  item_penjualan_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  qty REAL NOT NULL,
  qty_base REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  hpp_satuan REAL NOT NULL DEFAULT 0,
  hpp_total REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  movement_id TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (retur_penjualan_id) REFERENCES retur_penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id),
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
);
CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_doc ON item_retur_penjualan(retur_penjualan_id);
CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_source ON item_retur_penjualan(item_penjualan_id);

CREATE TABLE IF NOT EXISTS retur_pembelian (
  id TEXT PRIMARY KEY,
  nomor_retur TEXT UNIQUE NOT NULL,
  pembelian_id TEXT NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED', 'CANCELLED')),
  total_retur REAL NOT NULL DEFAULT 0,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  debt_reduction REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  catatan TEXT,
  dibuat_oleh TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (pembelian_id) REFERENCES pembelian(id),
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_retur_pembelian_purchase ON retur_pembelian(pembelian_id, tanggal);

CREATE TABLE IF NOT EXISTS item_retur_pembelian (
  id TEXT PRIMARY KEY,
  retur_pembelian_id TEXT NOT NULL,
  item_pembelian_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  qty REAL NOT NULL,
  qty_base REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  faktor_konversi REAL NOT NULL DEFAULT 1,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  dpp_total REAL NOT NULL DEFAULT 0,
  ppn_total REAL NOT NULL DEFAULT 0,
  movement_id TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (retur_pembelian_id) REFERENCES retur_pembelian(id) ON DELETE CASCADE,
  FOREIGN KEY (item_pembelian_id) REFERENCES item_pembelian(id),
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
);
CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_doc ON item_retur_pembelian(retur_pembelian_id);
CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_source ON item_retur_pembelian(item_pembelian_id);

-- Table: stock_opnames
CREATE TABLE IF NOT EXISTS stock_opnames (
  id TEXT PRIMARY KEY,
  nomor_opname TEXT UNIQUE NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  catatan TEXT,
  dibuat_oleh TEXT,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_delta_qty REAL NOT NULL DEFAULT 0,
  total_delta_value REAL NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
  FOREIGN KEY (posted_by) REFERENCES profil(id)
);
CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames(status, tanggal);

CREATE TABLE IF NOT EXISTS stock_opname_items (
  id TEXT PRIMARY KEY,
  stock_opname_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  system_qty REAL NOT NULL DEFAULT 0,
  counted_qty REAL,
  delta_qty REAL NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  delta_value REAL NOT NULL DEFAULT 0,
  catatan TEXT,
  movement_id TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (stock_opname_id) REFERENCES stock_opnames(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_doc ON stock_opname_items(stock_opname_id);
CREATE INDEX IF NOT EXISTS idx_stock_opname_items_barang ON stock_opname_items(barang_id);

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
  prioritas TEXT DEFAULT 'NORMAL' CHECK(prioritas IN ('NORMAL', 'KILAT', 'RENDAH', 'TINGGI', 'MENDESAK')),
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
  barang_id TEXT,
  barang_nama TEXT NOT NULL,
  jumlah REAL NOT NULL,
  nama_satuan TEXT NOT NULL,
  panjang REAL,
  lebar REAL,
  billed_panjang REAL,
  billed_lebar REAL,
  recommended_roll_width_m REAL,
  roll_inventory_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK(roll_inventory_status IN ('NOT_REQUIRED', 'PENDING', 'POSTED', 'VOIDED')),
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
  FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE SET NULL,
  FOREIGN KEY (operator_id) REFERENCES profil(id)
);

CREATE TABLE IF NOT EXISTS production_material_consumptions (
  id TEXT PRIMARY KEY,
  item_produksi_id TEXT NOT NULL,
  item_penjualan_id TEXT NOT NULL,
  barang_id TEXT NOT NULL,
  roll_variant_id TEXT NOT NULL,
  roll_width_m REAL NOT NULL,
  linear_used_m REAL NOT NULL,
  area_used_m2 REAL NOT NULL,
  billed_area_m2 REAL NOT NULL DEFAULT 0,
  waste_area_m2 REAL NOT NULL DEFAULT 0,
  movement_id TEXT,
  waste_movement_id TEXT,
  operator_id TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED', 'VOIDED')),
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  FOREIGN KEY (item_produksi_id) REFERENCES item_produksi(id) ON DELETE CASCADE,
  FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
  FOREIGN KEY (barang_id) REFERENCES barang(id),
  FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id),
  FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
  FOREIGN KEY (waste_movement_id) REFERENCES inventory_movements(id),
  FOREIGN KEY (operator_id) REFERENCES profil(id)
);

CREATE INDEX IF NOT EXISTS idx_production_consumptions_item ON production_material_consumptions(item_produksi_id, status);
CREATE INDEX IF NOT EXISTS idx_production_consumptions_roll ON production_material_consumptions(roll_variant_id, dibuat_pada);

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
  catatan TEXT,
  dibuat_oleh TEXT,
  diarsipkan_pada TEXT,
  label_arsip TEXT,
  reference_type TEXT,
  reference_id TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL,
  diperbarui_pada TIMESTAMPTZ NOT NULL,
  urutan_tampilan INTEGER DEFAULT 0,
  override_saldo INTEGER DEFAULT 0,
  override_omzet INTEGER DEFAULT 0,
  override_biaya_operasional INTEGER DEFAULT 0,
  override_biaya_bahan INTEGER DEFAULT 0,
  override_laba_bersih INTEGER DEFAULT 0,
  status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN ('POSTED', 'VOIDED')),
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  void_reason TEXT,
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_keuangan_sync_status ON keuangan(sync_status);
CREATE INDEX IF NOT EXISTS idx_keuangan_status_transaksi ON keuangan(status_transaksi);

-- Flexible finance configuration tables
CREATE TABLE IF NOT EXISTS finance_category_definitions (
  id TEXT PRIMARY KEY,
  category_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  color_bg TEXT NOT NULL DEFAULT 'bg-gray-100',
  color_text TEXT NOT NULL DEFAULT 'text-gray-800',
  color_border TEXT NOT NULL DEFAULT 'border-gray-300',
  direction TEXT NOT NULL DEFAULT 'both' CHECK(direction IN ('debit', 'kredit', 'both')),
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS finance_metric_mappings (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL UNIQUE,
  metric_label TEXT NOT NULL,
  metric_group TEXT NOT NULL CHECK(metric_group IN ('summary', 'profit_share', 'cash_advance')),
  source_column TEXT NOT NULL,
  participant_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

-- ============================================================================
-- BUSINESS ACTORS V2 (generic, name-free architecture)
-- ============================================================================
-- See migration 20260521090000_business_actors_v2.sql for full context.
-- This is the generic, name-free architecture for business actors and roles.

-- role_group is a display category for job titles (not a formula type).
CREATE TABLE IF NOT EXISTS peran_pegawai (
  id            TEXT PRIMARY KEY,
  role_code     TEXT NOT NULL UNIQUE,
  role_label    TEXT NOT NULL,
  role_group    TEXT NOT NULL DEFAULT 'other'
                 CHECK (role_group IN ('owner', 'management', 'sales', 'staff', 'other')),
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_peran_pegawai_group ON peran_pegawai(role_group);
CREATE INDEX IF NOT EXISTS idx_peran_pegawai_order ON peran_pegawai(display_order);

CREATE TABLE IF NOT EXISTS pegawai (
  id                       TEXT PRIMARY KEY,
  display_name             TEXT NOT NULL,
  role_code                TEXT NOT NULL REFERENCES peran_pegawai(role_code) ON UPDATE CASCADE,
  is_active                INTEGER NOT NULL DEFAULT 1,
  display_order            INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  profit_share_percent     REAL,
  cash_advance_categories  JSONB,
  keperluan_keyword        TEXT,
  bonus_percent            REAL,
  bonus_source_formula_key TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pegawai_role   ON pegawai(role_code);
CREATE INDEX IF NOT EXISTS idx_pegawai_active ON pegawai(is_active);
CREATE INDEX IF NOT EXISTS idx_pegawai_order  ON pegawai(display_order);

CREATE TABLE IF NOT EXISTS transaksi_terhitung (
  transaction_id TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key    TEXT NOT NULL,
  value          REAL NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);

CREATE INDEX IF NOT EXISTS idx_transaksi_terhitung_formula_key ON transaksi_terhitung(formula_key);
CREATE INDEX IF NOT EXISTS idx_transaksi_terhitung_transaction ON transaksi_terhitung(transaction_id);

CREATE TABLE IF NOT EXISTS transaksi_penggantian (
  transaction_id  TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key     TEXT NOT NULL,
  override_value  REAL NOT NULL,
  overridden_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);

CREATE INDEX IF NOT EXISTS idx_transaksi_penggantian_formula_key ON transaksi_penggantian(formula_key);

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

-- ============================================================================
-- SYNC ENGINE V2 METADATA TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL DEFAULT 'lww',
  winner_source TEXT NOT NULL,
  loser_source TEXT NOT NULL,
  winner_payload JSONB NOT NULL,
  loser_payload JSONB NOT NULL,
  winner_updated_at_server TIMESTAMPTZ,
  loser_updated_at_server TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_mutation_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_mutation_id TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT
);

CREATE TABLE IF NOT EXISTS device_registry (
  device_id TEXT PRIMARY KEY,
  device_type TEXT NOT NULL CHECK(device_type IN ('web', 'tauri', 'server')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
