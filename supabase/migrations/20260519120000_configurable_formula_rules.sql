-- Configurable formula rules for finance calculations.
-- Replaces hardcoded rules in cashbook-recalc-logic.ts with user-editable DB rows.

-- ── New table: per-column calculation rules ───────────────────────────────

CREATE TABLE IF NOT EXISTS finance_metric_column_rules (
  id TEXT PRIMARY KEY,
  column_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  rule_type TEXT NOT NULL DEFAULT 'accumulator'
    CHECK (rule_type IN ('saldo', 'accumulator', 'formula', 'kasbon_conditional', 'profit_share')),
  formula_expression TEXT,
  kasbon_conditions JSONB,
  is_system INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_metric_column_rules_order
  ON finance_metric_column_rules(display_order);

-- ── Add metric_contributions to categories ────────────────────────────────

ALTER TABLE finance_category_definitions
  ADD COLUMN IF NOT EXISTS metric_contributions JSONB;

-- ── Seed column rules (mirrors current hardcoded logic exactly) ───────────

INSERT INTO finance_metric_column_rules
  (id, column_name, display_name, rule_type, formula_expression, kasbon_conditions, is_system, display_order)
VALUES
  ('rule-saldo',          'saldo',              'Saldo',             'saldo',             NULL, NULL, 1, 10),
  ('rule-omzet',          'omzet',              'Omzet',             'accumulator',       NULL, NULL, 0, 20),
  ('rule-biaya-ops',      'biaya_operasional',  'Biaya Operasional', 'accumulator',       NULL, NULL, 0, 30),
  ('rule-biaya-bahan',    'biaya_bahan',        'Biaya Bahan',       'accumulator',       NULL, NULL, 0, 40),
  ('rule-laba',           'laba_bersih',        'Laba Bersih',       'formula',
    'omzet - biaya_operasional - biaya_bahan',  NULL, 0, 50),
  ('rule-kasbon-anwar',   'kasbon_anwar',       'Kasbon Mitra 1',    'kasbon_conditional', NULL,
    '{"categories":["PRIBADI-A"],"keperluan_contains":null,"amount":"kredit_minus_debit"}', 0, 60),
  ('rule-kasbon-suri',    'kasbon_suri',        'Kasbon Mitra 2',    'kasbon_conditional', NULL,
    '{"categories":["PRIBADI-S"],"keperluan_contains":null,"amount":"kredit_minus_debit"}', 0, 70),
  ('rule-kasbon-cahaya',  'kasbon_cahaya',      'Kasbon Karyawan 1', 'kasbon_conditional', NULL,
    '{"categories":["INVESTOR","BIAYA"],"keperluan_contains":"cahaya","amount":"kredit_minus_debit"}', 0, 80),
  ('rule-kasbon-dinil',   'kasbon_dinil',       'Kasbon Karyawan 2', 'kasbon_conditional', NULL,
    '{"categories":["INVESTOR","BIAYA"],"keperluan_contains":"dinil","amount":"kredit_minus_debit"}', 0, 90),
  ('rule-bagi-hasil-anwar', 'bagi_hasil_anwar', 'Bagi Hasil Slot 1', 'profit_share',      NULL, NULL, 1, 100),
  ('rule-bagi-hasil-suri',  'bagi_hasil_suri',  'Bagi Hasil Slot 2', 'profit_share',      NULL, NULL, 1, 110),
  ('rule-bagi-hasil-gemi',  'bagi_hasil_gemi',  'Bagi Hasil Slot 3', 'profit_share',      NULL, NULL, 1, 120)
ON CONFLICT (id) DO NOTHING;

-- ── Seed category contributions (mirrors current hardcoded rules) ─────────

UPDATE finance_category_definitions
SET metric_contributions = '[{"column":"omzet","amount_field":"debit","sign":1}]'
WHERE category_code IN ('OMZET', 'PIUTANG', 'LUNAS')
  AND metric_contributions IS NULL;

UPDATE finance_category_definitions
SET metric_contributions = '[{"column":"biaya_operasional","amount_field":"kredit","sign":1}]'
WHERE category_code IN ('BIAYA', 'TABUNGAN', 'KOMISI')
  AND metric_contributions IS NULL;

UPDATE finance_category_definitions
SET metric_contributions = '[{"column":"biaya_bahan","amount_field":"kredit","sign":1}]'
WHERE category_code IN ('SUPPLY', 'HUTANG')
  AND metric_contributions IS NULL;
