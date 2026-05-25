-- ════════════════════════════════════════════════════════════════════════════
-- Migration: surat_jalan
-- Goal: Add Surat Jalan (delivery note) feature for tracking goods that leave
--       the shop before payment is finalised. Common Indonesian business
--       practice: SJ accompanies the physical goods, customer signs to
--       acknowledge receipt, and the SJ later gets matched against the faktur
--       at payment time.
--
-- Two creation modes:
--   1. From a sale (penjualan_id set) — items copied from sale lines, useful
--      for piutang/NET30 transactions where goods leave but invoice is open.
--   2. Manual (penjualan_id NULL) — for free-form deliveries not tied to a
--      POS transaction (sample drops, returns to customer, etc).
--
-- Status flow: DRAFT → TERKIRIM → DITERIMA. DRAFT can still be edited;
-- TERKIRIM/DITERIMA are read-only (only catatan can be appended).
--
-- Tables created: surat_jalan, item_surat_jalan.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Surat jalan header.
CREATE TABLE IF NOT EXISTS surat_jalan (
  id TEXT PRIMARY KEY,
  nomor_sj TEXT UNIQUE NOT NULL,
  -- Optional back-link to source sale. Nullable so we support manual SJs.
  penjualan_id TEXT REFERENCES penjualan(id) ON DELETE SET NULL,
  -- Snapshot fields — keep SJ readable even if source sale/customer changes.
  pelanggan_nama TEXT,
  pelanggan_alamat TEXT,
  pelanggan_telepon TEXT,
  -- Logistik
  tanggal TEXT NOT NULL,
  nomor_kendaraan TEXT,
  pengirim_nama TEXT,
  -- Workflow status.
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','TERKIRIM','DITERIMA','BATAL')),
  catatan TEXT,
  -- Who created the SJ + audit timestamps.
  dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW(),
  diperbarui_pada TIMESTAMPTZ DEFAULT NOW(),
  -- When SJ was marked TERKIRIM / DITERIMA.
  tanggal_terkirim TIMESTAMPTZ,
  tanggal_diterima TIMESTAMPTZ,
  diterima_oleh TEXT  -- free-text name of receiver on customer side
);

CREATE INDEX IF NOT EXISTS idx_surat_jalan_penjualan
  ON surat_jalan(penjualan_id);
CREATE INDEX IF NOT EXISTS idx_surat_jalan_status
  ON surat_jalan(status);
CREATE INDEX IF NOT EXISTS idx_surat_jalan_tanggal
  ON surat_jalan(tanggal DESC);

-- 2. Surat jalan line items.
CREATE TABLE IF NOT EXISTS item_surat_jalan (
  id TEXT PRIMARY KEY,
  surat_jalan_id TEXT NOT NULL REFERENCES surat_jalan(id) ON DELETE CASCADE,
  -- Free-text item info — SJ doesn't reference barang directly because
  -- manual SJs can list anything (e.g. "sample produk" without a SKU).
  nama_barang TEXT NOT NULL,
  keterangan TEXT,
  ukuran TEXT,
  qty NUMERIC NOT NULL DEFAULT 1,
  satuan TEXT,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_surat_jalan_sj
  ON item_surat_jalan(surat_jalan_id);

-- 3. RLS policies — service role only (matches existing pattern).
ALTER TABLE surat_jalan ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_surat_jalan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON surat_jalan;
CREATE POLICY "Service role full access" ON surat_jalan
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON item_surat_jalan;
CREATE POLICY "Service role full access" ON item_surat_jalan
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Anon role read access (matches existing pattern from add_rls_policies_anon_access).
DROP POLICY IF EXISTS "Anon read" ON surat_jalan;
CREATE POLICY "Anon read" ON surat_jalan
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon read" ON item_surat_jalan;
CREATE POLICY "Anon read" ON item_surat_jalan
  FOR SELECT TO anon USING (true);

-- 5. Sync v2 columns (matches sync_v2_columns migration shape).
ALTER TABLE surat_jalan
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending','synced','conflict'));
ALTER TABLE surat_jalan
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE surat_jalan
  ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;
ALTER TABLE surat_jalan
  ADD COLUMN IF NOT EXISTS updated_at_server TIMESTAMPTZ;
ALTER TABLE surat_jalan
  ADD COLUMN IF NOT EXISTS updated_by_device TEXT DEFAULT 'server';

ALTER TABLE item_surat_jalan
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending','synced','conflict'));
ALTER TABLE item_surat_jalan
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE item_surat_jalan
  ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;
ALTER TABLE item_surat_jalan
  ADD COLUMN IF NOT EXISTS updated_at_server TIMESTAMPTZ;
ALTER TABLE item_surat_jalan
  ADD COLUMN IF NOT EXISTS updated_by_device TEXT DEFAULT 'server';

CREATE INDEX IF NOT EXISTS idx_surat_jalan_sync_status
  ON surat_jalan(sync_status);
CREATE INDEX IF NOT EXISTS idx_item_surat_jalan_sync_status
  ON item_surat_jalan(sync_status);

-- Note: SJ number generation uses hardcoded format SJ-YYYYMMDD-NNN
-- in surat-jalan-service.ts. Not configurable via pengaturan_toko (yet).
