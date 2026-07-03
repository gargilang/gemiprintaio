-- Keranjang tersimpan (parkir cart di POS). Ringan, tidak berinteraksi dengan
-- inventori/keuangan. cart_snapshot JSONB bawa isi cart lengkap.
CREATE TABLE IF NOT EXISTS keranjang_tersimpan (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  pelanggan_id TEXT REFERENCES pelanggan(id) ON DELETE SET NULL,
  pelanggan_nama_snapshot TEXT,
  pelanggan_kota TEXT,
  prioritas TEXT NOT NULL DEFAULT 'NORMAL' CHECK(prioritas IN ('NORMAL','KILAT')),
  ppn_snapshot JSONB,
  cart_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'AKTIF' CHECK(status IN ('AKTIF','KEDALUWARSA','JADIKAN_PENAWARAN','FINAL')),
  penawaran_id TEXT REFERENCES penawaran(id) ON DELETE SET NULL,
  kedaluwarsa_pada TIMESTAMPTZ,
  dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER NOT NULL DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT NOT NULL DEFAULT 'server',
  change_version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_status ON keranjang_tersimpan(status, kedaluwarsa_pada);
CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_pelanggan ON keranjang_tersimpan(pelanggan_id);

-- Katalog produk maklon berulang. Bukan barang stok; hanya template untuk
-- picker POS. biaya_subkontrak_default disembunyikan dari customer.
CREATE TABLE IF NOT EXISTS katalog_maklon (
  id TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  nama_satuan TEXT NOT NULL DEFAULT 'pcs',
  harga_jual_default REAL NOT NULL DEFAULT 0,
  biaya_subkontrak_default REAL NOT NULL DEFAULT 0,
  vendor_subkontrak_id_default TEXT REFERENCES vendor(id) ON DELETE SET NULL,
  metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30')),
  kategori TEXT,
  catatan_internal TEXT,
  is_aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending','synced','conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER NOT NULL DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT NOT NULL DEFAULT 'server',
  change_version INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan);
CREATE UNIQUE INDEX IF NOT EXISTS idx_katalog_maklon_nama_unik ON katalog_maklon(nama_produk) WHERE is_deleted = 0;
