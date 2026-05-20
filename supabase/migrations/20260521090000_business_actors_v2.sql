-- ════════════════════════════════════════════════════════════════════════════
-- Migration: business_actors_v2
-- Goal: introduce a generic, name-free schema for any number of people/roles
--       and any number of dynamic per-row computed values. Old tables and
--       columns are left intact for parallel-running validation; a separate
--       follow-up migration will drop them after one closing cycle.
-- ════════════════════════════════════════════════════════════════════════════

-- ── actor_roles ─────────────────────────────────────────────────────────────
-- Roles are user-defined. Seeded with common Indonesian SME roles so the UI
-- has a starting dropdown; users may add more from "Kelola Orang".

-- role_group is a DISPLAY CATEGORY for organising roles in the UI dropdown.
-- It does NOT restrict which formula types an actor can receive — any actor
-- can independently have profit share, kasbon, AND bonus at the same time.
CREATE TABLE IF NOT EXISTS actor_roles (
  id            TEXT PRIMARY KEY,
  role_code     TEXT NOT NULL UNIQUE,
  role_label    TEXT NOT NULL,
  role_group    TEXT NOT NULL DEFAULT 'other'
                 CHECK (role_group IN ('owner', 'management', 'sales', 'staff', 'other')),
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actor_roles_group ON actor_roles(role_group);
CREATE INDEX IF NOT EXISTS idx_actor_roles_order ON actor_roles(display_order);

-- Seed roles are job titles only. Formula types (bagi hasil / kasbon / bonus)
-- are configured PER ACTOR independently of this table.
INSERT INTO actor_roles (id, role_code, role_label, role_group, description, display_order) VALUES
  ('role-pemilik',     'PEMILIK',     'Pemilik / Investor',   'owner',      'Pemilik atau investor usaha',                 10),
  ('role-direktur',    'DIREKTUR',    'Direktur',             'owner',      'Direksi / direktur',                          20),
  ('role-komisaris',   'KOMISARIS',   'Komisaris',            'owner',      'Komisaris / pengawas',                        30),
  ('role-manager',     'MANAGER',     'Manager',              'management', 'Manajer cabang / divisi',                     40),
  ('role-supervisor',  'SUPERVISOR',  'Supervisor',           'management', 'Pengawas operasional',                        50),
  ('role-sales',       'SALES',       'Sales / Marketing',    'sales',      'Tenaga penjual / pemasaran',                  60),
  ('role-karyawan',    'KARYAWAN',    'Karyawan tetap',       'staff',      'Karyawan tetap',                              70),
  ('role-designer',    'DESIGNER',    'Designer / Operator',  'staff',      'Tenaga kreatif / operator cetak',             80),
  ('role-kasir',       'KASIR',       'Kasir / Front office', 'staff',      'Petugas kasir / front office',                90),
  ('role-kurir',       'KURIR',       'Kurir / Driver',       'staff',      'Pengantar / driver',                         100),
  ('role-lainnya',     'LAINNYA',     'Lainnya',              'other',      'Peran lain yang tidak tercakup di atas',     110)
ON CONFLICT (role_code) DO UPDATE
  SET role_group   = EXCLUDED.role_group,
      description  = EXCLUDED.description;

-- ── business_actors ─────────────────────────────────────────────────────────
-- Replaces both finance_participants AND cashbook_partner. Every person /
-- entity that appears anywhere in finance lives here.
--
-- profit_share_percent: only meaningful when role_group='profit_share'
-- cash_advance_categories: JSONB array of kategori_transaksi codes that
--   contribute to this actor's kasbon (e.g. ["PRIBADI-A"] or ["INVESTOR","BIAYA"])
-- keperluan_keyword: for "kasbon by keperluan" pattern (Cahaya/Dinil style)
-- bonus_percent / bonus_source_formula: for sales/bonus computations
--
-- All optional — actors with role_group='other' have no calc at all.

CREATE TABLE IF NOT EXISTS business_actors (
  id                       TEXT PRIMARY KEY,
  display_name             TEXT NOT NULL,
  role_code                TEXT NOT NULL REFERENCES actor_roles(role_code) ON UPDATE CASCADE,
  is_active                INTEGER NOT NULL DEFAULT 1,
  display_order            INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  -- profit_share fields
  profit_share_percent     REAL,
  -- cash_advance fields
  cash_advance_categories  JSONB,
  keperluan_keyword        TEXT,
  -- bonus fields
  bonus_percent            REAL,
  bonus_source_formula_key TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_actors_role     ON business_actors(role_code);
CREATE INDEX IF NOT EXISTS idx_business_actors_active   ON business_actors(is_active);
CREATE INDEX IF NOT EXISTS idx_business_actors_order    ON business_actors(display_order);

-- ── transaction_computed ────────────────────────────────────────────────────
-- One (transaction_id, formula_key) → value row per metric. Replaces the
-- hardcoded G..O columns on `keuangan` once validation succeeds.

CREATE TABLE IF NOT EXISTS transaction_computed (
  transaction_id TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key    TEXT NOT NULL,
  value          REAL NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);

CREATE INDEX IF NOT EXISTS idx_tc_formula_key ON transaction_computed(formula_key);
CREATE INDEX IF NOT EXISTS idx_tc_transaction ON transaction_computed(transaction_id);

-- ── transaction_overrides ───────────────────────────────────────────────────
-- Per-cell manual overrides. Replaces the `override_*` boolean columns on
-- `keuangan` once validation succeeds.

CREATE TABLE IF NOT EXISTS transaction_overrides (
  transaction_id  TEXT NOT NULL REFERENCES keuangan(id) ON DELETE CASCADE,
  formula_key     TEXT NOT NULL,
  override_value  REAL NOT NULL,
  overridden_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (transaction_id, formula_key)
);

CREATE INDEX IF NOT EXISTS idx_to_formula_key ON transaction_overrides(formula_key);

-- ── cashbook_formula: add semantic columns ──────────────────────────────────
-- `formula_key` is the new human-readable identifier ("omzet", "laba_bersih",
-- "kasbon_andi"). It is backfilled from `db_column` for existing rows so the
-- old letter-keyed system keeps working in parallel.
--
-- `actor_id` links a formula to a business_actor (for auto-named kasbon /
-- bagi hasil / bonus formulas).
--
-- `formula_group` lets the UI group formulas into bars (Ringkasan, Bagi Hasil,
-- Kasbon, Bonus, Kustom).

ALTER TABLE cashbook_formula
  ADD COLUMN IF NOT EXISTS formula_key   TEXT,
  ADD COLUMN IF NOT EXISTS actor_id      TEXT REFERENCES business_actors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS formula_group TEXT NOT NULL DEFAULT 'custom'
                                          CHECK (formula_group IN ('summary', 'profit_share', 'cash_advance', 'bonus', 'custom'));

-- Backfill formula_key from db_column for existing rows.
UPDATE cashbook_formula
  SET formula_key = db_column
  WHERE formula_key IS NULL;

-- Classify legacy formulas into groups based on db_column prefix.
UPDATE cashbook_formula
  SET formula_group = 'summary'
  WHERE db_column IN ('omzet', 'biaya_operasional', 'biaya_bahan', 'saldo', 'laba_bersih')
    AND formula_group = 'custom';

UPDATE cashbook_formula
  SET formula_group = 'profit_share'
  WHERE db_column LIKE 'bagi_hasil_%'
    AND formula_group = 'custom';

UPDATE cashbook_formula
  SET formula_group = 'cash_advance'
  WHERE db_column LIKE 'kasbon_%'
    AND formula_group = 'custom';

CREATE INDEX IF NOT EXISTS idx_cashbook_formula_key   ON cashbook_formula(formula_key);
CREATE INDEX IF NOT EXISTS idx_cashbook_formula_actor ON cashbook_formula(actor_id);
CREATE INDEX IF NOT EXISTS idx_cashbook_formula_group ON cashbook_formula(formula_group);

-- ── RLS policies (mirror the existing anon_full_access pattern) ─────────────
-- Internal app, all users trusted; service_role is server-side only.

ALTER TABLE actor_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_actors        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_computed   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_overrides  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_full_access ON actor_roles;
CREATE POLICY anon_full_access ON actor_roles            FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON business_actors;
CREATE POLICY anon_full_access ON business_actors        FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON transaction_computed;
CREATE POLICY anon_full_access ON transaction_computed   FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anon_full_access ON transaction_overrides;
CREATE POLICY anon_full_access ON transaction_overrides  FOR ALL TO anon USING (true) WITH CHECK (true);
