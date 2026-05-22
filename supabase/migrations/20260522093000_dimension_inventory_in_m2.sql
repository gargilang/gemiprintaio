-- ════════════════════════════════════════════════════════════════════════════
-- Migration: dimension_inventory_in_m2
-- Goal: support tracking dimensional materials (banner / flexi / vinyl) in
--       square meters. Purchase rows can record the physical roll dimensions
--       (panjang × lebar in meters) and the inventory keeps a single
--       conservative total in m² regardless of how many physical rolls /
--       cuts exist.
--
-- Changes:
--   1. Add `panjang` and `lebar` columns to item_pembelian (mirrors the
--      already-existing fields on item_penjualan / item_produksi).
--   2. Seed an `m²` unit in satuan_barang so users can pick it as
--      satuan_dasar for dimensional materials.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add dimension columns on purchase items.
ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS panjang REAL;

ALTER TABLE item_pembelian
  ADD COLUMN IF NOT EXISTS lebar REAL;

-- 2. Seed the square-meter unit. Existing installs get it on next sync.
INSERT INTO satuan_barang (id, nama, urutan_tampilan)
VALUES ('unit-m2', 'm²', 0)
ON CONFLICT (id) DO NOTHING;
