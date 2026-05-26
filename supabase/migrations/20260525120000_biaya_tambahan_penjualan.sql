-- ════════════════════════════════════════════════════════════════════════════
-- Migration: biaya_tambahan_penjualan
-- Goal: support header-level extra charges on a sale (ongkir, biaya pasang,
--       admin fee, biaya kirim, dll) with free-text labels. Each sale can
--       have N extra-charge rows; total is denormalised onto the sale header
--       for fast list/report queries.
--
-- Tables created: biaya_tambahan_penjualan.
-- Columns added : penjualan.biaya_tambahan_total.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS biaya_tambahan_penjualan (
  id TEXT PRIMARY KEY,
  penjualan_id TEXT NOT NULL REFERENCES penjualan(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  nominal NUMERIC NOT NULL DEFAULT 0,
  urutan INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biaya_tambahan_penjualan_sale
  ON biaya_tambahan_penjualan(penjualan_id);

-- Sync columns (matches sync_v2 pattern).
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending','synced','conflict'));
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS updated_at_server TIMESTAMPTZ;
ALTER TABLE biaya_tambahan_penjualan
  ADD COLUMN IF NOT EXISTS updated_by_device TEXT DEFAULT 'server';

CREATE INDEX IF NOT EXISTS idx_biaya_tambahan_sync_status
  ON biaya_tambahan_penjualan(sync_status);

-- Rollup column on penjualan for fast queries (matches dpp_total/ppn_total pattern).
ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS biaya_tambahan_total NUMERIC NOT NULL DEFAULT 0;

-- RLS — service role only (matches existing pattern).
ALTER TABLE biaya_tambahan_penjualan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON biaya_tambahan_penjualan;
CREATE POLICY "Service role full access" ON biaya_tambahan_penjualan
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon read" ON biaya_tambahan_penjualan;
CREATE POLICY "Anon read" ON biaya_tambahan_penjualan
  FOR SELECT TO anon USING (true);
