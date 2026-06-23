-- supabase/migrations/20260624000000_keuangan_periode_id.sql
-- Tambah kolom periode_id ke keuangan + backfill data Mei 2026.
-- Migrasi bersifat idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING).

ALTER TABLE keuangan
  ADD COLUMN IF NOT EXISTS periode_id TEXT REFERENCES accounting_periods(id);

-- Buat periode Mei 2026 untuk backfill (accounting_periods masih kosong saat ini).
-- ON CONFLICT DO NOTHING supaya migrasi aman bila dijalankan ulang.
INSERT INTO accounting_periods (
  id, period_key, start_date, end_date, status,
  dibuat_pada, diperbarui_pada
)
VALUES (
  gen_random_uuid()::text,
  '2026-05',
  '2026-05-01',
  '2026-05-31',
  'OPEN',
  now(),
  now()
)
ON CONFLICT (period_key) DO NOTHING;

-- Backfill: tag semua transaksi Mei 2026 ke periode yang baru dibuat.
UPDATE keuangan
SET periode_id = (
  SELECT id FROM accounting_periods WHERE period_key = '2026-05'
)
WHERE tanggal BETWEEN '2026-05-01' AND '2026-05-31'
  AND periode_id IS NULL;

-- Index untuk performa query filter per periode.
CREATE INDEX IF NOT EXISTS idx_keuangan_periode_id ON keuangan(periode_id);
