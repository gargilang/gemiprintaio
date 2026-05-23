-- ════════════════════════════════════════════════════════════════════════════
-- Migration: faktur_data_capture
-- Goal: capture data needed to print an A5 sales invoice (faktur) that mirrors
--       the physical Gemiprint nota — line-item dimensions and customer
--       header info that survives walk-in sales / customer record edits.
--
-- Changes:
--   1. item_penjualan: add panjang / lebar (mirror item_produksi). Today these
--      live on the cart and the production order, but never on the sale items
--      themselves, so we cannot reproduce a faktur from a sale alone.
--   2. penjualan: add pelanggan_nama_snapshot and pelanggan_kota.
--      - Snapshot lets a walk-in record a "Kepada Yth" name without creating a
--        pelanggan row, and preserves the original name even if the linked
--        pelanggan is later edited or deleted.
--      - Kota is used in the "Bekasi, <date>" header line. Defaults are filled
--        in by the UI (typically "Bekasi"), not by the database.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Sale line-item dimensions (in meters, like item_produksi).
ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS panjang REAL;

ALTER TABLE item_penjualan
  ADD COLUMN IF NOT EXISTS lebar REAL;

-- 2. Sale-level customer snapshot for faktur header.
ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS pelanggan_nama_snapshot TEXT;

ALTER TABLE penjualan
  ADD COLUMN IF NOT EXISTS pelanggan_kota TEXT;
