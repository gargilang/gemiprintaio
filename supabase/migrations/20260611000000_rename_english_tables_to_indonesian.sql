-- ════════════════════════════════════════════════════════════════════════════
-- Migration: rename_english_tables_to_indonesian
-- Goal: finish the Indonesian-localization effort by renaming the five
--       English-named tables (and their dependent indexes/constraints) to
--       Indonesian, then dropping the two superseded legacy tables.
--
--   business_actors        -> pegawai
--   actor_roles            -> peran_pegawai
--   transaction_computed   -> transaksi_terhitung
--   transaction_overrides  -> transaksi_penggantian
--   cashbook_formula       -> rumus_buku_kas
--   cashbook_partner       -> (dropped, legacy/superseded)
--   finance_participants   -> (dropped, legacy/superseded)
--
-- Every statement is guarded so the migration is idempotent and safe to re-run
-- against an already-migrated database (Requirement 2.6). Renames use
-- ALTER TABLE ... RENAME so existing rows are preserved (Requirement 2.3, 8.1).
-- Already-applied historical migration files are NOT edited (Requirement 2.2).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Table renames (guarded: old exists AND new does not) ─────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'business_actors')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pegawai') THEN
    ALTER TABLE public.business_actors RENAME TO pegawai;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'actor_roles')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'peran_pegawai') THEN
    ALTER TABLE public.actor_roles RENAME TO peran_pegawai;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'transaction_computed')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'transaksi_terhitung') THEN
    ALTER TABLE public.transaction_computed RENAME TO transaksi_terhitung;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'transaction_overrides')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'transaksi_penggantian') THEN
    ALTER TABLE public.transaction_overrides RENAME TO transaksi_penggantian;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cashbook_formula')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'rumus_buku_kas') THEN
    ALTER TABLE public.cashbook_formula RENAME TO rumus_buku_kas;
  END IF;
END $$;

-- ── 2. Index renames (ALTER INDEX IF EXISTS is inherently guarded) ──────────
-- Per the design's index derivation table. idx_cashbook_formula_visible (added
-- by 20260522020000) also embeds a renamed object name, so it is renamed too
-- to satisfy Requirement 1.8.

-- business_actors -> pegawai
ALTER INDEX IF EXISTS idx_business_actors_role   RENAME TO idx_pegawai_role;
ALTER INDEX IF EXISTS idx_business_actors_active RENAME TO idx_pegawai_active;
ALTER INDEX IF EXISTS idx_business_actors_order  RENAME TO idx_pegawai_order;

-- actor_roles -> peran_pegawai
ALTER INDEX IF EXISTS idx_actor_roles_group RENAME TO idx_peran_pegawai_group;
ALTER INDEX IF EXISTS idx_actor_roles_order RENAME TO idx_peran_pegawai_order;

-- transaction_computed -> transaksi_terhitung
ALTER INDEX IF EXISTS idx_tc_formula_key RENAME TO idx_transaksi_terhitung_formula_key;
ALTER INDEX IF EXISTS idx_tc_transaction RENAME TO idx_transaksi_terhitung_transaction;

-- transaction_overrides -> transaksi_penggantian
ALTER INDEX IF EXISTS idx_to_formula_key RENAME TO idx_transaksi_penggantian_formula_key;

-- cashbook_formula -> rumus_buku_kas
ALTER INDEX IF EXISTS idx_cashbook_formula_order   RENAME TO idx_rumus_buku_kas_order;
ALTER INDEX IF EXISTS idx_cashbook_formula_key     RENAME TO idx_rumus_buku_kas_key;
ALTER INDEX IF EXISTS idx_cashbook_formula_actor   RENAME TO idx_rumus_buku_kas_actor;
ALTER INDEX IF EXISTS idx_cashbook_formula_group   RENAME TO idx_rumus_buku_kas_group;
-- Note: idx_rumus_buku_kas_visible is intentionally Postgres-only (renamed here
-- from idx_cashbook_formula_visible). The SQLite runtime runner does not create
-- a matching is_visible_in_summary index by design, so its absence on the
-- SQLite side is not a missed rename.
ALTER INDEX IF EXISTS idx_cashbook_formula_visible RENAME TO idx_rumus_buku_kas_visible;

-- ── 3. Constraint renames (guarded via pg_constraint existence check) ───────
-- ALTER TABLE ... RENAME CONSTRAINT has no IF EXISTS form, so each rename is
-- wrapped in a DO block that verifies the (old) constraint exists on the
-- (already-renamed) table. Names below are the Postgres auto-generated names
-- derived from the original CREATE TABLE / ALTER TABLE statements; any that do
-- not match a real object are simply skipped, keeping the migration idempotent
-- and safe (Requirement 1.8, 2.4, 2.6).

DO $$
DECLARE
  r TEXT[];
  renames CONSTANT TEXT[][] := ARRAY[
    -- [ new-table-name, old-constraint-name, new-constraint-name ]
    ['peran_pegawai',         'actor_roles_pkey',                       'peran_pegawai_pkey'],
    ['peran_pegawai',         'actor_roles_role_code_key',              'peran_pegawai_role_code_key'],
    ['peran_pegawai',         'actor_roles_role_group_check',           'peran_pegawai_role_group_check'],
    ['pegawai',               'business_actors_pkey',                   'pegawai_pkey'],
    ['pegawai',               'business_actors_role_code_fkey',         'pegawai_role_code_fkey'],
    ['transaksi_terhitung',   'transaction_computed_pkey',              'transaksi_terhitung_pkey'],
    ['transaksi_terhitung',   'transaction_computed_transaction_id_fkey','transaksi_terhitung_transaction_id_fkey'],
    ['transaksi_penggantian', 'transaction_overrides_pkey',             'transaksi_penggantian_pkey'],
    ['transaksi_penggantian', 'transaction_overrides_transaction_id_fkey','transaksi_penggantian_transaction_id_fkey'],
    ['rumus_buku_kas',        'cashbook_formula_pkey',                  'rumus_buku_kas_pkey'],
    ['rumus_buku_kas',        'cashbook_formula_column_key_key',        'rumus_buku_kas_column_key_key'],
    ['rumus_buku_kas',        'cashbook_formula_actor_id_fkey',         'rumus_buku_kas_actor_id_fkey'],
    ['rumus_buku_kas',        'cashbook_formula_formula_group_check',   'rumus_buku_kas_formula_group_check']
  ];
BEGIN
  FOREACH r SLICE 1 IN ARRAY renames LOOP
    IF to_regclass('public.' || r[1]) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = r[2]
           AND conrelid = ('public.' || r[1])::regclass
       )
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = r[3]
           AND conrelid = ('public.' || r[1])::regclass
       ) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', r[1], r[2], r[3]);
    END IF;
  END LOOP;
END $$;

-- ── 4. Resolve the finance_participants FK before dropping the table ────────
-- finance_metric_mappings.participant_id references finance_participants via
-- finance_metric_mappings_participant_id_fkey (ON DELETE SET NULL). Drop the FK
-- but RETAIN the participant_id column (it becomes a free-standing nullable
-- column) to avoid scope creep beyond the rename mapping (Requirement 2.5).

ALTER TABLE IF EXISTS public.finance_metric_mappings
  DROP CONSTRAINT IF EXISTS finance_metric_mappings_participant_id_fkey;

-- ── 5. Drop legacy tables with a non-empty-row guard (Requirement 8.4) ──────
-- A non-empty removal-scheduled table must NEVER be dropped silently. Each drop
-- is gated by a row-count check that RAISES an exception if rows are present.
--
-- MAINTAINER ACTION (manual confirmation gate): if either RAISE below fires,
-- the table still holds data. Review/migrate/back up the rows, then either
-- delete the rows or temporarily comment out the matching RAISE EXCEPTION line
-- and re-run this migration to allow the DROP to proceed.

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'cashbook_partner') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.cashbook_partner' INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'cashbook_partner still contains % row(s); manual confirmation required before DROP (see migration header).', v_count;
    END IF;
    DROP TABLE IF EXISTS public.cashbook_partner;
  END IF;
END $$;

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'finance_participants') THEN
    EXECUTE 'SELECT COUNT(*) FROM public.finance_participants' INTO v_count;
    IF v_count > 0 THEN
      RAISE EXCEPTION 'finance_participants still contains % row(s); manual confirmation required before DROP (see migration header).', v_count;
    END IF;
    DROP TABLE IF EXISTS public.finance_participants;
  END IF;
END $$;
