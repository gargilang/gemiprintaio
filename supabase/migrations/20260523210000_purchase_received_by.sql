-- ════════════════════════════════════════════════════════════════════════════
-- Migration: purchase_received_by
-- Goal: track who physically received the goods at the warehouse, separate
--       from dibuat_oleh (the person who entered the record in the system).
--       Used on the internal "Bukti Penerimaan Barang" print-out.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE pembelian
  ADD COLUMN IF NOT EXISTS diterima_oleh TEXT;
