-- Add business role and percentage-based profit sharing to finance_participants
ALTER TABLE finance_participants
  ADD COLUMN IF NOT EXISTS participant_role TEXT DEFAULT 'PEMILIK'
    CHECK (participant_role IS NULL OR participant_role IN ('PEMILIK', 'MANAGER', 'INVESTOR')),
  ADD COLUMN IF NOT EXISTS share_percent REAL NOT NULL DEFAULT 100;

-- Also allow percentage_based in the profit_formula CHECK constraint.
-- Postgres does not support ALTER CONSTRAINT, so we drop and re-add it.
ALTER TABLE finance_participants DROP CONSTRAINT IF EXISTS finance_participants_profit_formula_check;
ALTER TABLE finance_participants
  ADD CONSTRAINT finance_participants_profit_formula_check
    CHECK (profit_formula IS NULL OR profit_formula IN (
      'third_minus_kasbon', 'incremental_investor', 'percentage_based'
    ));
