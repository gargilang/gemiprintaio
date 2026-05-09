-- Flexible finance architecture: dynamic categories, participants, and metrics mapping

CREATE TABLE IF NOT EXISTS finance_category_definitions (
  id TEXT PRIMARY KEY,
  category_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  color_bg TEXT NOT NULL DEFAULT 'bg-gray-100',
  color_text TEXT NOT NULL DEFAULT 'text-gray-800',
  color_border TEXT NOT NULL DEFAULT 'border-gray-300',
  direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('debit', 'kredit', 'both')),
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_finance_category_definitions_active
  ON finance_category_definitions(is_active, display_order);

CREATE TABLE IF NOT EXISTS finance_participants (
  id TEXT PRIMARY KEY,
  participant_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role_type TEXT NOT NULL DEFAULT 'other' CHECK (role_type IN ('profit_share', 'cash_advance', 'other')),
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_finance_participants_active
  ON finance_participants(is_active, display_order);

CREATE TABLE IF NOT EXISTS finance_metric_mappings (
  id TEXT PRIMARY KEY,
  metric_key TEXT NOT NULL UNIQUE,
  metric_label TEXT NOT NULL,
  metric_group TEXT NOT NULL CHECK (metric_group IN ('summary', 'profit_share', 'cash_advance')),
  source_column TEXT NOT NULL,
  participant_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
  last_synced_at TIMESTAMPTZ,
  sync_version INTEGER DEFAULT 1,
  FOREIGN KEY (participant_id) REFERENCES finance_participants(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_metric_mappings_active
  ON finance_metric_mappings(is_active, metric_group, display_order);

INSERT INTO finance_participants (id, participant_code, display_name, role_type, display_order)
VALUES
  ('fin-participant-anwar', 'ANWAR', 'Anwar', 'profit_share', 10),
  ('fin-participant-suri', 'SURI', 'Suri', 'profit_share', 20),
  ('fin-participant-gemi', 'GEMI', 'Gemi', 'profit_share', 30),
  ('fin-participant-cahaya', 'CAHAYA', 'Cahaya', 'cash_advance', 40),
  ('fin-participant-dinil', 'DINIL', 'Dinil', 'cash_advance', 50)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role_type = EXCLUDED.role_type,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

INSERT INTO finance_metric_mappings (
  id, metric_key, metric_label, metric_group, source_column, participant_id, display_order
)
VALUES
  ('fin-metric-bagi-hasil-anwar', 'bagi_hasil_anwar', 'Bagi Hasil', 'profit_share', 'bagi_hasil_anwar', 'fin-participant-anwar', 10),
  ('fin-metric-bagi-hasil-suri', 'bagi_hasil_suri', 'Bagi Hasil', 'profit_share', 'bagi_hasil_suri', 'fin-participant-suri', 20),
  ('fin-metric-bagi-hasil-gemi', 'bagi_hasil_gemi', 'Bagi Hasil', 'profit_share', 'bagi_hasil_gemi', 'fin-participant-gemi', 30),
  ('fin-metric-kasbon-cahaya', 'kasbon_cahaya', 'Kasbon', 'cash_advance', 'kasbon_cahaya', 'fin-participant-cahaya', 40),
  ('fin-metric-kasbon-dinil', 'kasbon_dinil', 'Kasbon', 'cash_advance', 'kasbon_dinil', 'fin-participant-dinil', 50)
ON CONFLICT (id) DO UPDATE SET
  metric_label = EXCLUDED.metric_label,
  metric_group = EXCLUDED.metric_group,
  source_column = EXCLUDED.source_column,
  participant_id = EXCLUDED.participant_id,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

INSERT INTO finance_category_definitions (
  id, category_code, display_name, color_bg, color_text, color_border, direction, display_order
)
VALUES
  ('fin-cat-kas', 'KAS', 'Kas', 'bg-blue-100', 'text-blue-800', 'border-blue-300', 'both', 10),
  ('fin-cat-biaya', 'BIAYA', 'Biaya', 'bg-red-100', 'text-red-800', 'border-red-300', 'kredit', 20),
  ('fin-cat-omzet', 'OMZET', 'Omzet', 'bg-green-100', 'text-green-800', 'border-green-300', 'debit', 30),
  ('fin-cat-investor', 'INVESTOR', 'Investor', 'bg-purple-100', 'text-purple-800', 'border-purple-300', 'both', 40),
  ('fin-cat-subsidi', 'SUBSIDI', 'Subsidi', 'bg-yellow-100', 'text-yellow-800', 'border-yellow-300', 'debit', 50),
  ('fin-cat-lunas', 'LUNAS', 'Lunas', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'debit', 60),
  ('fin-cat-supply', 'SUPPLY', 'Supply', 'bg-orange-100', 'text-orange-800', 'border-orange-300', 'kredit', 70),
  ('fin-cat-laba', 'LABA', 'Laba', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'both', 80),
  ('fin-cat-komisi', 'KOMISI', 'Komisi', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'kredit', 90),
  ('fin-cat-tabungan', 'TABUNGAN', 'Tabungan', 'bg-indigo-100', 'text-indigo-800', 'border-indigo-300', 'kredit', 100),
  ('fin-cat-hutang', 'HUTANG', 'Hutang', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 110),
  ('fin-cat-piutang', 'PIUTANG', 'Piutang', 'bg-lime-100', 'text-lime-800', 'border-lime-300', 'debit', 120),
  ('fin-cat-pribadi-a', 'PRIBADI-A', 'Pribadi A', 'bg-sky-100', 'text-sky-800', 'border-sky-300', 'both', 130),
  ('fin-cat-pribadi-s', 'PRIBADI-S', 'Pribadi S', 'bg-pink-100', 'text-pink-800', 'border-pink-300', 'both', 140)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  color_bg = EXCLUDED.color_bg,
  color_text = EXCLUDED.color_text,
  color_border = EXCLUDED.color_border,
  direction = EXCLUDED.direction,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();
