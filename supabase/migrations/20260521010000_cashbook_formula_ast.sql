-- AST-backed cashbook formulas + partners for the visual formula builder.
--
-- Replaces the previous hardcoded G..O logic with user-editable JSON ASTs.
-- Seeded defaults reproduce the exact behaviour of the legacy formulas.

-- ── cashbook_formula ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashbook_formula (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  column_key TEXT NOT NULL UNIQUE,
  db_column TEXT NOT NULL,
  ast JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashbook_formula_order
  ON cashbook_formula(display_order);

-- ── cashbook_partner ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cashbook_partner (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashbook_partner_order
  ON cashbook_partner(display_order);

-- ── Seed partners (legacy, kept for backward compatibility only) ─────────
-- v2 architecture replaced partners with business_actors; this section is
-- intentionally empty so a fresh install starts with no person names
-- anywhere. Existing installs that still have rows are cleaned up by
-- migration 20260522030000_cleanup_legacy_seed_data.sql.

-- ── Seed formulas — system defaults only ─────────────────────────────────
-- Only the 5 group-agnostic system formulas (Omzet, Biaya Operasional,
-- Biaya Bahan, Saldo, Laba Bersih) are seeded here. Per-person formulas
-- (kasbon, bagi hasil, bonus) are generated dynamically from the
-- "Pengurus" tab so a fresh install never carries stranger names.
-- ASTs match `src/lib/ast/defaults.ts` exactly; keep both in sync if either
-- changes. The literal text below is intentionally verbose so reviewers can
-- audit it without running TypeScript.

INSERT INTO cashbook_formula (id, name, column_key, db_column, ast, enabled, is_system, display_order, description) VALUES
  (
    'formula-g-omzet', 'Omzet', 'G', 'omzet',
    '{"type":"if","cond":{"type":"or","left":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"OMZET"},"within":{"type":"columnRef","column":"C"}}}},"right":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"PIUTANG"},"within":{"type":"columnRef","column":"C"}}}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"columnRef","column":"D"},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"D"}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"G"}}}'::jsonb,
    TRUE, FALSE, 10, 'Akumulasi penjualan + piutang.'
  ),
  (
    'formula-h-biaya-ops', 'Biaya Operasional', 'H', 'biaya_operasional',
    '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"H"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"H"}}}'::jsonb,
    TRUE, FALSE, 20, 'Akumulasi BIAYA + TABUNGAN.'
  ),
  (
    'formula-i-biaya-bahan', 'Biaya Bahan', 'I', 'biaya_bahan',
    '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"SUPPLY"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HUTANG"}}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"SUPPLY"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HUTANG"}}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"I"}}}'::jsonb,
    TRUE, FALSE, 30, 'Akumulasi SUPPLY + HUTANG.'
  ),
  (
    'formula-j-saldo', 'Saldo', 'J', 'saldo',
    '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"binaryOp","op":"-","left":{"type":"columnRef","column":"D"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"J"},"right":{"type":"columnRef","column":"D"}},"right":{"type":"columnRef","column":"E"}}}'::jsonb,
    TRUE, FALSE, 40, 'Saldo kas berjalan (debit − kredit).'
  ),
  (
    'formula-k-laba', 'Laba Bersih', 'K', 'laba_bersih',
    '{"type":"binaryOp","op":"-","left":{"type":"outputRef","column":"G"},"right":{"type":"binaryOp","op":"+","left":{"type":"outputRef","column":"H"},"right":{"type":"outputRef","column":"I"}}}'::jsonb,
    TRUE, FALSE, 50, 'Omzet − (Biaya Operasional + Biaya Bahan).'
  )
ON CONFLICT (id) DO NOTHING;
