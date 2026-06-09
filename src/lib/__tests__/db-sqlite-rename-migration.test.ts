/**
 * Integration test for the SQLite English → Indonesian table rename behavior.
 *
 * Seeds a temporary in-memory SQLite database with OLD-named tables
 * (`business_actors`, `actor_roles` with the legacy role_group CHECK, and
 * `cashbook_formula`), old-named indexes, and sample rows, then runs the real
 * `ensureServerSQLiteSyncV2Schema` bootstrap. It asserts that:
 *   - the Indonesian table exists and the English name is gone,
 *   - all seeded rows are preserved,
 *   - the Indonesian-named indexes exist (and the old ones are dropped),
 *   - the legacy role_group CHECK is rebuilt so new group values are accepted,
 *   - a second bootstrap run is a no-op (no error, data unchanged).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 8.1
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

import { ensureServerSQLiteSyncV2Schema } from "../db-sqlite-migrations";

type Db = InstanceType<typeof Database>;

const FRESH_SCHEMA_PATH = path.join(
  process.cwd(),
  "database",
  "sqlite-schema.sql"
);

function indexExists(db: Db, name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name = ? LIMIT 1"
      )
      .get(name) !== undefined
  );
}

function tableExists(db: Db, name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1"
      )
      .get(name) !== undefined
  );
}

/**
 * Builds an in-memory database that mimics an OLD local install: every
 * Indonesian table from the fresh schema is created first, then the two
 * renamed tables are dropped and recreated under their English names with
 * old-named indexes and seeded rows. The remaining Indonesian tables keep
 * the bootstrap's FK targets and backfills satisfied.
 */
function buildLegacyDatabase(): Db {
  const db = new Database(":memory:");
  // Keep FKs off while we lay down the schema and swap names; the bootstrap
  // manages its own pragmas during the actual migration.
  db.pragma("foreign_keys = OFF");

  const schemaSql = fs.readFileSync(FRESH_SCHEMA_PATH, "utf8");
  db.exec(schemaSql);

  // The bootstrap seeds a placeholder "maklon" barang that FK-references
  // kategori_barang('cat-lain-lain'); provide that prerequisite category so
  // the unrelated seed succeeds with foreign keys enabled.
  db.exec(`
    INSERT OR IGNORE INTO kategori_barang (id, nama, urutan_tampilan)
      VALUES ('cat-lain-lain', 'Lain-lain', 8);
  `);

  // ── business_actors (was renamed from pegawai) ──────────────────────────
  db.exec(`
    DROP INDEX IF EXISTS idx_pegawai_role;
    DROP INDEX IF EXISTS idx_pegawai_active;
    DROP INDEX IF EXISTS idx_pegawai_order;
    DROP TABLE IF EXISTS pegawai;

    CREATE TABLE business_actors (
      id                       TEXT PRIMARY KEY,
      display_name             TEXT NOT NULL,
      role_code                TEXT NOT NULL,
      is_active                INTEGER NOT NULL DEFAULT 1,
      display_order            INTEGER NOT NULL DEFAULT 0,
      notes                    TEXT,
      profit_share_percent     REAL,
      cash_advance_categories  TEXT,
      keperluan_keyword        TEXT,
      bonus_percent            REAL,
      bonus_source_formula_key TEXT,
      created_at               TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_code) REFERENCES peran_pegawai(role_code) ON UPDATE CASCADE
    );
    CREATE INDEX idx_business_actors_role   ON business_actors(role_code);
    CREATE INDEX idx_business_actors_active ON business_actors(is_active);
    CREATE INDEX idx_business_actors_order  ON business_actors(display_order);

    INSERT INTO business_actors (id, display_name, role_code, is_active, display_order)
      VALUES
        ('actor-1', 'Budi', 'KARYAWAN', 1, 10),
        ('actor-2', 'Sari', 'KASIR',    1, 20),
        ('actor-3', 'Tono', 'SALES',    0, 30);
  `);

  // ── actor_roles (was renamed from peran_pegawai) ────────────────────────
  // Recreate the legacy table under its OLD name WITH the pre-decoupling CHECK
  // constraint (role_group restricted to formula-type values). SQLite's
  // RENAME TO carries this CHECK over, so the runtime runner must rebuild the
  // table afterwards or the seed (role_group = 'owner'/'staff'/...) is rejected.
  db.exec(`
    DROP INDEX IF EXISTS idx_peran_pegawai_group;
    DROP INDEX IF EXISTS idx_peran_pegawai_order;
    DROP TABLE IF EXISTS peran_pegawai;

    CREATE TABLE actor_roles (
      id            TEXT PRIMARY KEY,
      role_code     TEXT NOT NULL UNIQUE,
      role_label    TEXT NOT NULL,
      role_group    TEXT NOT NULL DEFAULT 'profit_share'
                      CHECK (role_group IN ('profit_share', 'cash_advance', 'bonus')),
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_actor_roles_group ON actor_roles(role_group);
    CREATE INDEX idx_actor_roles_order ON actor_roles(display_order);

    INSERT INTO actor_roles (id, role_code, role_label, role_group, display_order)
      VALUES
        ('role-legacy-pemilik', 'PEMILIK', 'Pemilik', 'profit_share', 10),
        ('role-legacy-sales',   'SALES',   'Sales',   'bonus',        20);
  `);

  // ── cashbook_formula (was renamed from rumus_buku_kas) ──────────────────
  db.exec(`
    DROP INDEX IF EXISTS idx_rumus_buku_kas_order;
    DROP TABLE IF EXISTS rumus_buku_kas;

    CREATE TABLE cashbook_formula (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      column_key TEXT NOT NULL UNIQUE,
      db_column TEXT,
      ast TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_cashbook_formula_order ON cashbook_formula(display_order);

    INSERT INTO cashbook_formula (id, name, column_key, db_column, ast, is_system, display_order)
      VALUES
        ('cf-omzet', 'Omzet', 'omzet', 'omzet', '{"type":"col"}', 1, 10),
        ('cf-saldo', 'Saldo', 'saldo', 'saldo', '{"type":"col"}', 1, 20);
  `);

  return db;
}

describe("migrateEnglishTablesToIndonesian (via ensureServerSQLiteSyncV2Schema)", () => {
  let db: Db;

  afterEach(() => {
    db?.close();
  });

  it("renames legacy English tables to Indonesian while preserving rows and indexes", () => {
    db = buildLegacyDatabase();

    // Sanity: we really start from the old-named state.
    expect(tableExists(db, "business_actors")).toBe(true);
    expect(tableExists(db, "cashbook_formula")).toBe(true);
    expect(tableExists(db, "pegawai")).toBe(false);
    expect(tableExists(db, "rumus_buku_kas")).toBe(false);

    ensureServerSQLiteSyncV2Schema(db);

    // Indonesian tables exist, English names are gone (Req 5.1).
    expect(tableExists(db, "pegawai")).toBe(true);
    expect(tableExists(db, "rumus_buku_kas")).toBe(true);
    expect(tableExists(db, "business_actors")).toBe(false);
    expect(tableExists(db, "cashbook_formula")).toBe(false);

    // All seeded rows are preserved (Req 8.1).
    const pegawai = db
      .prepare("SELECT id, display_name, role_code FROM pegawai ORDER BY id")
      .all() as Array<{ id: string; display_name: string; role_code: string }>;
    expect(pegawai).toEqual([
      { id: "actor-1", display_name: "Budi", role_code: "KARYAWAN" },
      { id: "actor-2", display_name: "Sari", role_code: "KASIR" },
      { id: "actor-3", display_name: "Tono", role_code: "SALES" },
    ]);

    const formulas = db
      .prepare("SELECT id, column_key FROM rumus_buku_kas ORDER BY id")
      .all() as Array<{ id: string; column_key: string }>;
    expect(formulas).toEqual([
      { id: "cf-omzet", column_key: "omzet" },
      { id: "cf-saldo", column_key: "saldo" },
    ]);

    // Indonesian-named indexes exist; old ones are dropped (Req 5.3).
    expect(indexExists(db, "idx_pegawai_role")).toBe(true);
    expect(indexExists(db, "idx_pegawai_active")).toBe(true);
    expect(indexExists(db, "idx_pegawai_order")).toBe(true);
    expect(indexExists(db, "idx_rumus_buku_kas_order")).toBe(true);

    expect(indexExists(db, "idx_business_actors_role")).toBe(false);
    expect(indexExists(db, "idx_business_actors_active")).toBe(false);
    expect(indexExists(db, "idx_business_actors_order")).toBe(false);
    expect(indexExists(db, "idx_cashbook_formula_order")).toBe(false);
  });

  it("rebuilds the legacy actor_roles CHECK so peran_pegawai accepts new role_group values (I-1)", () => {
    db = buildLegacyDatabase();

    // Sanity: legacy table starts with the restrictive CHECK constraint.
    const legacySql = (
      db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='actor_roles'"
        )
        .get() as { sql: string }
    ).sql;
    expect(legacySql).toContain("profit_share");

    ensureServerSQLiteSyncV2Schema(db);

    // After migration the table is peran_pegawai and the legacy CHECK is gone.
    expect(tableExists(db, "peran_pegawai")).toBe(true);
    expect(tableExists(db, "actor_roles")).toBe(false);
    const newSql = (
      db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='peran_pegawai'"
        )
        .get() as { sql: string }
    ).sql;
    expect(newSql).not.toContain("CHECK (role_group IN ('profit_share'");

    // The seed upsert writes role_group = 'owner'/'management'/... — inserting
    // such a row must NOT be rejected by a stale CHECK.
    expect(() =>
      db
        .prepare(
          "INSERT INTO peran_pegawai (id, role_code, role_label, role_group, display_order) VALUES (?, ?, ?, ?, ?)"
        )
        .run("role-new-owner", "OWNER_NEW", "Owner Baru", "owner", 999)
    ).not.toThrow();

    // The pre-existing legacy rows are remapped to the new group vocabulary.
    const pemilik = db
      .prepare("SELECT role_group FROM peran_pegawai WHERE id = 'role-legacy-pemilik'")
      .get() as { role_group: string };
    expect(pemilik.role_group).toBe("owner");
  });

  it("is a no-op on a second run (already-migrated database, Req 5.2 & 5.5)", () => {
    db = buildLegacyDatabase();

    ensureServerSQLiteSyncV2Schema(db);

    const pegawaiAfterFirst = db
      .prepare("SELECT COUNT(*) AS c FROM pegawai")
      .get() as { c: number };
    const formulaAfterFirst = db
      .prepare("SELECT COUNT(*) AS c FROM rumus_buku_kas")
      .get() as { c: number };

    // Second run must complete without error and leave the data unchanged.
    expect(() => ensureServerSQLiteSyncV2Schema(db)).not.toThrow();

    expect(tableExists(db, "pegawai")).toBe(true);
    expect(tableExists(db, "rumus_buku_kas")).toBe(true);
    expect(tableExists(db, "business_actors")).toBe(false);
    expect(tableExists(db, "cashbook_formula")).toBe(false);

    const pegawaiAfterSecond = db
      .prepare("SELECT COUNT(*) AS c FROM pegawai")
      .get() as { c: number };
    const formulaAfterSecond = db
      .prepare("SELECT COUNT(*) AS c FROM rumus_buku_kas")
      .get() as { c: number };

    expect(pegawaiAfterSecond.c).toBe(pegawaiAfterFirst.c);
    expect(formulaAfterSecond.c).toBe(formulaAfterFirst.c);
  });
});
