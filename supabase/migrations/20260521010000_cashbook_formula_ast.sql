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

-- ── Seed partners ─────────────────────────────────────────────────────────
-- Cahaya / Suri / Gemi only; Anwar + Dinil intentionally omitted.

INSERT INTO cashbook_partner (id, name, category, display_order) VALUES
  ('partner-cahaya', 'Cahaya', NULL,        10),
  ('partner-suri',   'Suri',   'PRIBADI-S', 20),
  ('partner-gemi',   'Gemi',   NULL,        30)
ON CONFLICT (id) DO NOTHING;

-- ── Seed formulas (G..O) ──────────────────────────────────────────────────
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
  ),
  (
    'formula-l-kasbon-suri', 'Kasbon Suri', 'L', 'kasbon_suri',
    '{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"PRIBADI-S"}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"columnRef","column":"D"},"then":{"type":"negate","arg":{"type":"columnRef","column":"D"}},"else":{"type":"columnRef","column":"E"}},"else":{"type":"if","cond":{"type":"columnRef","column":"D"},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"L"},"right":{"type":"columnRef","column":"D"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"L"},"right":{"type":"columnRef","column":"E"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"L"}}}'::jsonb,
    TRUE, FALSE, 60, 'Saldo kasbon Suri (kategori PRIBADI-S).'
  ),
  (
    'formula-m-bagi-hasil-suri', 'Bagi Hasil Suri', 'M', 'bagi_hasil_suri',
    '{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"/","left":{"type":"outputRef","column":"K"},"right":{"type":"literal","value":2}},"right":{"type":"outputRef","column":"L"}}'::jsonb,
    TRUE, FALSE, 70, 'Setengah laba bersih dikurangi kasbon Suri.'
  ),
  (
    'formula-n-bagi-hasil-gemi', 'Bagi Hasil Gemi', 'N', 'bagi_hasil_gemi',
    '{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"+","left":{"type":"binaryOp","op":"+","left":{"type":"binaryOp","op":"/","left":{"type":"binaryOp","op":"-","left":{"type":"outputRef","column":"K"},"right":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"K"}}},"right":{"type":"literal","value":2}},"right":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"N"}}},"right":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"INVESTOR"}},"then":{"type":"columnRef","column":"D"},"else":{"type":"literal","value":0}}},"right":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"INVESTOR"}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}}}'::jsonb,
    TRUE, FALSE, 80, 'Akumulasi kenaikan laba ÷ 2 + transaksi investor.'
  ),
  (
    'formula-o-kasbon-cahaya', 'Kasbon Cahaya', 'O', 'kasbon_cahaya',
    '{"type":"if","cond":{"type":"and","left":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"partnerRef","partnerId":"partner-cahaya"},"within":{"type":"columnRef","column":"F"}}}},"right":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"INVESTOR"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"columnRef","column":"D"},"then":{"type":"negate","arg":{"type":"columnRef","column":"D"}},"else":{"type":"columnRef","column":"E"}},"else":{"type":"if","cond":{"type":"columnRef","column":"D"},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"O"},"right":{"type":"columnRef","column":"D"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"O"},"right":{"type":"columnRef","column":"E"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"O"}}}'::jsonb,
    TRUE, FALSE, 90, 'Saldo kasbon Cahaya (transaksi INVESTOR/BIAYA dengan keperluan Cahaya).'
  )
ON CONFLICT (id) DO NOTHING;
