-- ════════════════════════════════════════════════════════════════════════════
-- Migration: PPN (Pajak Pertambahan Nilai) full support
--
-- Goal: enable Indonesian VAT (PPN) on sales and purchases for PKP-status
--       printing shops. Supports:
--         - Per-transaction toggle "kena PPN" (so non-PKP customers tetap clean).
--         - Tarif tersimpan per-transaksi (saat ini 11%, akan naik 12% per UU HPP).
--         - Mode hitung: EKSKLUSIF (harga + PPN) atau INKLUSIF (harga sudah PPN).
--         - NSFP (Nomor Seri Faktur Pajak) format 16 digit: KK.SSS-YY.NNNNNNNN
--         - Kode transaksi 01-09 (default 01 untuk penjualan umum).
--         - PPN masukan kreditable / non-kreditable di pembelian.
--         - Cetak header faktur pajak dari pengaturan_toko (NPWP, alamat).
--
-- Catatan: ini *bukan* integrasi Coretax DJP. NSFP harus diambil user dari
-- Coretax dan diketik manual (atau auto-increment dari pool yang dia upload).
-- Tujuan migration: data lengkap dan akurat untuk dasar input ke Coretax dan
-- output PDF faktur pajak yang valid.
-- ════════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- 1. pengaturan_toko: identitas + status PKP toko
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengaturan_toko (
  id TEXT PRIMARY KEY DEFAULT 'default',
  nama_toko TEXT NOT NULL DEFAULT 'Toko',
  alamat TEXT,
  telepon TEXT,
  email TEXT,
  npwp TEXT,
  alamat_npwp TEXT,
  -- PKP = Pengusaha Kena Pajak. Kalau false, semua toggle PPN otomatis disembunyikan.
  status_pkp INTEGER NOT NULL DEFAULT 0,
  -- Tarif default PPN saat ini 11% (UU HPP, akan jadi 12% per Jan 2025 untuk
  -- sebagian barang). User bisa override per-transaksi.
  ppn_persen_default REAL NOT NULL DEFAULT 11,
  -- EKSKLUSIF (B2B, harga + PPN) atau INKLUSIF (retail POS, harga sudah PPN).
  ppn_metode_default TEXT NOT NULL DEFAULT 'EKSKLUSIF'
    CHECK (ppn_metode_default IN ('EKSKLUSIF', 'INKLUSIF')),
  -- Default kena_ppn untuk transaksi baru.
  ppn_default_aktif INTEGER NOT NULL DEFAULT 0,
  -- NSFP pool: user upload range dari Coretax, app pakai berurutan.
  nsfp_kode_transaksi_default TEXT NOT NULL DEFAULT '01',
  nsfp_tahun_aktif TEXT,
  nsfp_seri_terakhir TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT
);

INSERT INTO pengaturan_toko (id, nama_toko)
VALUES ('default', 'gemiprint')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pengaturan_toko ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON pengaturan_toko;
CREATE POLICY anon_full_access ON pengaturan_toko
  FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON pengaturan_toko TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON pengaturan_toko TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pengaturan_toko TO service_role;

-- ---------------------------------------------------------------------------
-- 2. nsfp_pool: pool NSFP yang sudah didapat dari Coretax DJP
-- ---------------------------------------------------------------------------
-- User upload range dari Coretax (mis. 00000001 - 00000100 untuk tahun 25),
-- app auto-pick yang berikutnya saat user terbitkan faktur. Setelah dipakai,
-- nomor itu lock ke faktur penjualan tertentu.
CREATE TABLE IF NOT EXISTS nsfp_pool (
  id TEXT PRIMARY KEY,
  tahun TEXT NOT NULL,                              -- '25' (2 digit terakhir tahun)
  kode_transaksi TEXT NOT NULL DEFAULT '01',        -- 01-09
  nomor_seri TEXT NOT NULL,                         -- 8 digit: '00000001'
  status TEXT NOT NULL DEFAULT 'TERSEDIA'
    CHECK (status IN ('TERSEDIA', 'TERPAKAI', 'BATAL')),
  penjualan_id TEXT,                                -- terisi saat status TERPAKAI
  catatan TEXT,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  updated_at_server TIMESTAMPTZ,
  updated_by_device TEXT DEFAULT 'server',
  change_version INTEGER DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  client_mutation_id TEXT,
  UNIQUE (tahun, kode_transaksi, nomor_seri),
  FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_nsfp_pool_status ON nsfp_pool(status, tahun, nomor_seri);
CREATE INDEX IF NOT EXISTS idx_nsfp_pool_penjualan ON nsfp_pool(penjualan_id);

ALTER TABLE nsfp_pool ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_full_access ON nsfp_pool;
CREATE POLICY anon_full_access ON nsfp_pool
  FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON nsfp_pool TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON nsfp_pool TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON nsfp_pool TO service_role;

-- ---------------------------------------------------------------------------
-- 3. NPWP party data
-- ---------------------------------------------------------------------------
ALTER TABLE pelanggan
  ADD COLUMN IF NOT EXISTS alamat_npwp TEXT,
  ADD COLUMN IF NOT EXISTS nama_di_npwp TEXT;

ALTER TABLE vendor
  ADD COLUMN IF NOT EXISTS npwp TEXT,
  ADD COLUMN IF NOT EXISTS alamat_npwp TEXT,
  ADD COLUMN IF NOT EXISTS nama_di_npwp TEXT;

-- ---------------------------------------------------------------------------
-- 4. Sales: PPN keluaran
-- ---------------------------------------------------------------------------
ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS kena_ppn INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_persen REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
    CHECK (ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  ADD COLUMN IF NOT EXISTS dpp_total REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_total REAL NOT NULL DEFAULT 0,
  -- NSFP komposit: '010.025-25.00000001'. Disimpan dipisah supaya laporan
  -- dan validasi mudah.
  ADD COLUMN IF NOT EXISTS nsfp_kode_transaksi TEXT,
  ADD COLUMN IF NOT EXISTS nsfp_tahun TEXT,
  ADD COLUMN IF NOT EXISTS nsfp_nomor_seri TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_faktur_pajak DATE,
  ADD COLUMN IF NOT EXISTS pelanggan_npwp_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS pelanggan_alamat_npwp_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS pelanggan_nama_npwp_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_penjualan_kena_ppn ON penjualan(kena_ppn);
CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_faktur_pajak
  ON penjualan(tanggal_faktur_pajak);

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS dpp_satuan REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_satuan REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dpp_total REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_total REAL NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. Purchases: PPN masukan
-- ---------------------------------------------------------------------------
ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS kena_ppn INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_persen REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF'
    CHECK (ppn_metode IN ('EKSKLUSIF', 'INKLUSIF')),
  ADD COLUMN IF NOT EXISTS dpp_total REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_total REAL NOT NULL DEFAULT 0,
  -- PPN masukan dari faktur vendor. Tidak semua bisa dikreditkan (mis. faktur
  -- cacat, vendor non-PKP, dll). User pilih saat input.
  ADD COLUMN IF NOT EXISTS dapat_dikreditkan INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nomor_faktur_pajak_vendor TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_faktur_pajak DATE,
  ADD COLUMN IF NOT EXISTS vendor_npwp_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_pembelian_kena_ppn ON pembelian(kena_ppn);
CREATE INDEX IF NOT EXISTS idx_pembelian_dapat_dikreditkan
  ON pembelian(dapat_dikreditkan);
CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_faktur_pajak
  ON pembelian(tanggal_faktur_pajak);

ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS dpp_satuan REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_satuan REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dpp_total REAL NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ppn_total REAL NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 6. PPN helper: hitung DPP/PPN dari subtotal + tarif + metode
-- ---------------------------------------------------------------------------
-- Mengembalikan {dpp, ppn} berdasarkan jumlah final + metode.
-- Eksklusif: subtotal = DPP. PPN = DPP * tarif/100. Total = DPP + PPN.
-- Inklusif: subtotal = DPP + PPN. DPP = subtotal / (1 + tarif/100).
CREATE OR REPLACE FUNCTION public.hitung_ppn(
  amount REAL,
  tarif REAL,
  metode TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dpp REAL;
  v_ppn REAL;
  v_total REAL;
  v_tarif REAL := COALESCE(tarif, 0);
BEGIN
  IF amount IS NULL OR amount = 0 OR v_tarif <= 0 THEN
    RETURN jsonb_build_object('dpp', COALESCE(amount, 0), 'ppn', 0, 'total', COALESCE(amount, 0));
  END IF;

  IF UPPER(COALESCE(metode, 'EKSKLUSIF')) = 'INKLUSIF' THEN
    v_dpp := ROUND((amount / (1 + v_tarif / 100))::NUMERIC, 2);
    v_ppn := ROUND((amount - v_dpp)::NUMERIC, 2);
    v_total := amount;
  ELSE
    v_dpp := amount;
    v_ppn := ROUND((amount * v_tarif / 100)::NUMERIC, 2);
    v_total := v_dpp + v_ppn;
  END IF;

  RETURN jsonb_build_object('dpp', v_dpp, 'ppn', v_ppn, 'total', v_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hitung_ppn(REAL, REAL, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hitung_ppn(REAL, REAL, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.hitung_ppn(REAL, REAL, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hitung_ppn(REAL, REAL, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. View: laporan PPN keluaran (penjualan kena PPN)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ppn_keluaran AS
SELECT
  p.id AS penjualan_id,
  p.nomor_invoice,
  p.tanggal_faktur_pajak,
  p.dibuat_pada::DATE AS tanggal_transaksi,
  p.nsfp_kode_transaksi,
  p.nsfp_tahun,
  p.nsfp_nomor_seri,
  CASE
    WHEN p.nsfp_kode_transaksi IS NOT NULL
      AND p.nsfp_tahun IS NOT NULL
      AND p.nsfp_nomor_seri IS NOT NULL
      THEN p.nsfp_kode_transaksi || '0.000-' || p.nsfp_tahun || '.' || p.nsfp_nomor_seri
    ELSE NULL
  END AS nomor_faktur_pajak,
  p.pelanggan_id,
  COALESCE(p.pelanggan_nama_npwp_snapshot, p.pelanggan_nama_snapshot, pl.nama) AS pelanggan_nama,
  COALESCE(p.pelanggan_npwp_snapshot, pl.npwp) AS pelanggan_npwp,
  COALESCE(p.pelanggan_alamat_npwp_snapshot, pl.alamat_npwp, pl.alamat) AS pelanggan_alamat,
  p.dpp_total,
  p.ppn_persen,
  p.ppn_total,
  p.total_jumlah,
  p.status_transaksi,
  p.kena_ppn
FROM penjualan p
LEFT JOIN pelanggan pl ON pl.id = p.pelanggan_id
WHERE p.kena_ppn = 1;

GRANT SELECT ON v_ppn_keluaran TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. View: laporan PPN masukan (pembelian kena PPN)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ppn_masukan AS
SELECT
  pb.id AS pembelian_id,
  pb.nomor_pembelian,
  pb.nomor_faktur,
  pb.tanggal_faktur_pajak,
  pb.tanggal AS tanggal_transaksi,
  pb.nomor_faktur_pajak_vendor,
  pb.vendor_id,
  COALESCE(pb.vendor_npwp_snapshot, v.npwp) AS vendor_npwp,
  v.nama_perusahaan AS vendor_nama,
  COALESCE(v.alamat_npwp, v.alamat) AS vendor_alamat,
  pb.dpp_total,
  pb.ppn_persen,
  pb.ppn_total,
  pb.total_jumlah,
  pb.dapat_dikreditkan,
  pb.status_transaksi,
  pb.kena_ppn
FROM pembelian pb
LEFT JOIN vendor v ON v.id = pb.vendor_id
WHERE pb.kena_ppn = 1;

GRANT SELECT ON v_ppn_masukan TO anon, authenticated, service_role;
