-- Fase 5 batch 1: Rename kolom Inggris ke Bahasa Indonesia.
--
-- Database belum berisi data produksi (instalasi pertama / development),
-- jadi rename pakai ALTER TABLE ... RENAME COLUMN langsung tanpa perlu
-- copy data atau alias. Lebih bersih daripada strategi additive dual-write.
--
-- Kolom yang di-rename:
--   • penjualan.nomor_invoice -> nomor_faktur

-- ── 1. Rename kolom utama di tabel penjualan ───────────────────────────────
ALTER TABLE penjualan
  RENAME COLUMN nomor_invoice TO nomor_faktur;

-- ── 2. Rename constraint UNIQUE dan indeks supaya konsisten ────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'penjualan_nomor_invoice_key'
  ) THEN
    ALTER TABLE penjualan
      RENAME CONSTRAINT penjualan_nomor_invoice_key TO penjualan_nomor_faktur_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'penjualan' AND indexname = 'idx_penjualan_nomor_invoice'
  ) THEN
    ALTER INDEX idx_penjualan_nomor_invoice RENAME TO idx_penjualan_nomor_faktur;
  END IF;
END $$;
