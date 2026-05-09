-- Rename role 'chief' -> 'staff' and add new roles 'kasir' and 'operator'
-- in the local SQLite database.
--
-- SQLite doesn't support DROP/ADD CHECK constraints in place, so we patch
-- sqlite_master directly via PRAGMA writable_schema, then VACUUM to force
-- the schema parser to re-read the updated DDL.
--
-- The sqlite3 CLI ships with the "defensive" connection flag enabled which
-- blocks writes to sqlite_master even with writable_schema=ON. So this file
-- must be applied with `defensive` disabled, e.g.:
--
--   sqlite3 database/gemiprint.db \
--     -cmd ".dbconfig defensive 0" \
--     -cmd "PRAGMA writable_schema = ON;" \
--     ".read database/sqlite-migration-roles-staff-kasir-operator.sql"
--
-- Or run the equivalent statements one-by-one (see commands in the script
-- runner if any).

-- 1. Migrate existing rows that hold the old 'chief' role
--    (still allowed under the current CHECK constraint).
UPDATE profil
SET role = 'staff',
    diperbarui_pada = datetime('now')
WHERE role = 'chief';

-- 2. Patch the CHECK constraint in the stored schema.
UPDATE sqlite_master
SET sql = replace(
  sql,
  '''admin'', ''manager'', ''chief'', ''user''',
  '''admin'', ''manager'', ''staff'', ''kasir'', ''operator'', ''user'''
)
WHERE type = 'table'
  AND name = 'profil'
  AND sql LIKE '%CHECK(role IN%';

PRAGMA writable_schema = OFF;

-- 3. Force SQLite to recompile the schema with the new CHECK list.
VACUUM;
