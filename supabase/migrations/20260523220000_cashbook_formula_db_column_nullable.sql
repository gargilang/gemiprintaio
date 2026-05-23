-- ════════════════════════════════════════════════════════════════════════════
-- Migration: cashbook_formula_db_column_nullable
-- Goal: allow `cashbook_formula.db_column` to be NULL.
--
-- Some system formulas (Modal Kas, Piutang Kas, Kas) have no corresponding
-- column in the `keuangan` table. They flow only through `transaction_computed`.
-- The previous NOT NULL constraint silently blocked seeding these formulas,
-- which is why the "Kas" summary card was always Rp 0.
--
-- The formula engine itself is unchanged. This migration only relaxes the
-- schema constraint so the seed can succeed.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE cashbook_formula
  ALTER COLUMN db_column DROP NOT NULL;
