-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Nomor Urut Settings (invoice & SPK number formatting)
--
-- Menambahkan kolom konfigurasi penomoran faktur (INV) dan SPK ke tabel
-- pengaturan_toko yang sudah ada. Pendekatan ini konsisten dengan migrasi
-- sebelumnya yang juga ALTER TABLE pengaturan_toko.
--
-- Kolom baru:
--   inv_prefix          : prefix nomor faktur, default 'INV'
--   inv_format          : 'PREFIX-DATE-SEQ' atau 'PREFIX-SEQ'
--   inv_reset           : kapan urutan direset: 'daily'|'monthly'|'yearly'|'never'
--   inv_padding         : jumlah digit padding urutan (mis. 3 → 001)
--   inv_start_seq       : urutan awal saat reset (default 1)
--   spk_prefix          : prefix nomor SPK, default 'SPK'
--   spk_format          : 'PREFIX-DATE-SEQ' atau 'PREFIX-SEQ'
--   spk_reset           : kapan urutan direset: 'daily'|'monthly'|'yearly'|'never'
--   spk_padding         : jumlah digit padding urutan (mis. 4 → 0001)
--   spk_start_seq       : urutan awal saat reset (default 1)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE pengaturan_toko
  ADD COLUMN IF NOT EXISTS inv_prefix       TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS inv_format       TEXT NOT NULL DEFAULT 'PREFIX-DATE-SEQ'
    CHECK (inv_format IN ('PREFIX-DATE-SEQ', 'PREFIX-SEQ')),
  ADD COLUMN IF NOT EXISTS inv_reset        TEXT NOT NULL DEFAULT 'daily'
    CHECK (inv_reset IN ('daily', 'monthly', 'yearly', 'never')),
  ADD COLUMN IF NOT EXISTS inv_padding      INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS inv_start_seq    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS spk_prefix       TEXT NOT NULL DEFAULT 'SPK',
  ADD COLUMN IF NOT EXISTS spk_format       TEXT NOT NULL DEFAULT 'PREFIX-SEQ'
    CHECK (spk_format IN ('PREFIX-DATE-SEQ', 'PREFIX-SEQ')),
  ADD COLUMN IF NOT EXISTS spk_reset        TEXT NOT NULL DEFAULT 'never'
    CHECK (spk_reset IN ('daily', 'monthly', 'yearly', 'never')),
  ADD COLUMN IF NOT EXISTS spk_padding      INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS spk_start_seq    INTEGER NOT NULL DEFAULT 1;

-- Pastikan row default sudah punya nilai yang benar
UPDATE pengaturan_toko
SET
  inv_prefix    = COALESCE(inv_prefix,    'INV'),
  inv_format    = COALESCE(inv_format,    'PREFIX-DATE-SEQ'),
  inv_reset     = COALESCE(inv_reset,     'daily'),
  inv_padding   = COALESCE(inv_padding,   3),
  inv_start_seq = COALESCE(inv_start_seq, 1),
  spk_prefix    = COALESCE(spk_prefix,    'SPK'),
  spk_format    = COALESCE(spk_format,    'PREFIX-SEQ'),
  spk_reset     = COALESCE(spk_reset,     'never'),
  spk_padding   = COALESCE(spk_padding,   4),
  spk_start_seq = COALESCE(spk_start_seq, 1)
WHERE id = 'default';
