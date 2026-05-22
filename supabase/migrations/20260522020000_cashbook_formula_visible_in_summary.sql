-- ════════════════════════════════════════════════════════════════════════════
-- Migration: cashbook_formula_visible_in_summary
-- Goal: add an opt-in flag controlling whether a formula appears as its own
--       column in the Keuangan "Ringkasan per orang" panel. Defaults to true
--       for the canonical actor groups (profit_share / cash_advance / bonus)
--       and false for everything else, so existing UIs keep their current
--       behaviour.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE cashbook_formula
  ADD COLUMN IF NOT EXISTS is_visible_in_summary BOOLEAN NOT NULL DEFAULT FALSE;

-- Default to visible for the three canonical actor-driven groups so the
-- existing Bagi Hasil / Kasbon / Bonus columns keep showing up after the
-- migration. Custom + summary formulas stay hidden until the user opts in.
UPDATE cashbook_formula
  SET is_visible_in_summary = TRUE
  WHERE formula_group IN ('profit_share', 'cash_advance', 'bonus');

CREATE INDEX IF NOT EXISTS idx_cashbook_formula_visible
  ON cashbook_formula(is_visible_in_summary);
