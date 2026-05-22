-- ════════════════════════════════════════════════════════════════════════════
-- Migration: cleanup_legacy_seed_data
-- Goal: hard-delete (not disable) every formula/partner/category that was
--       seeded with hardcoded person names from earlier migrations. After
--       this migration runs, the only formulas left in cashbook_formula are
--       (a) the 5 system defaults (Omzet, Biaya Operasional, Biaya Bahan,
--       Saldo, Laba Bersih) and (b) actor-driven formulas that have a real
--       actor_id linked through tab Pengurus.
--
-- Why: the original install ran the v1 migrations which seeded specific
--       person names (Suri, Gemi, Cahaya, Anwar, Dinil) directly into
--       cashbook_formula and cashbook_partner. The v2 sync only adds /
--       disables formulas based on actor_id, leaving the orphans visible
--       in the Kolom and Rumus tabs forever.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Hard-delete orphan actor-typed formulas. Only formulas in profit_share /
--    cash_advance / bonus groups that have NO actor_id are removed. System
--    formulas (formula_group = 'summary') and user customs with an actor_id
--    are preserved.
DELETE FROM cashbook_formula
  WHERE actor_id IS NULL
    AND COALESCE(is_system, FALSE) = FALSE
    AND formula_group IN ('profit_share', 'cash_advance', 'bonus');

-- 2. Drop every cashbook_partner row. The v2 architecture replaced partners
--    with business_actors; cashbook_partner is purely legacy. Any AST that
--    still references a partner_id will fall back to an empty string at
--    eval time and the user can replace it via the Expression Assistant.
DELETE FROM cashbook_partner;

-- 3. Remove the two hardcoded "PRIBADI" categories that were seeded for the
--    original Anwar/Suri kasbon split. User is free to recreate them with
--    new names if their business needs them.
DELETE FROM finance_category_definitions
  WHERE category_code IN ('PRIBADI-A', 'PRIBADI-S');
