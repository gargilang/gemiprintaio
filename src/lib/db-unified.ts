/**
 * Unified Database Adapter
 *
 * Strategy:
 * 1. Tauri App: SQLite (primary) + Supabase sync (background)
 * 2. Web App: Supabase (primary) + offline queue (fallback)
 *
 * All database operations MUST go through this adapter
 *
 * CONSOLIDATION: This file replaces db-adapter.ts, db.ts, and sqlite-db.ts
 */

import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { WEB_SERVER_MEDIATED_ONLY } from "./sync-config";

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

/**
 * Normalize record for consistency between SQLite and Supabase
 * - Boolean conversion (SQLite 0/1 ↔ Supabase true/false)
 * - Timestamp fields already consistent (dibuat_pada, diperbarui_pada)
 */
export function normalizeRecord(
  record: Record<string, any>,
  direction: "toSupabase" | "fromSupabase" | "toSQLite" | "fromSQLite"
): Record<string, any> {
  const normalized: Record<string, any> = { ...record };

  // Boolean normalization only (timestamps already consistent)
  if (direction === "toSupabase" || direction === "fromSQLite") {
    // SQLite → Supabase: 0/1 → false/true
    Object.keys(normalized).forEach((key) => {
      if (
        typeof normalized[key] === "number" &&
        (normalized[key] === 0 || normalized[key] === 1)
      ) {
        // Only convert fields that are likely booleans
        if (
          key.includes("aktif") ||
          key.includes("is_") ||
          key.includes("has_") ||
          key.includes("status") ||
          key.includes("privat")
        ) {
          normalized[key] = normalized[key] === 1;
        }
      }
    });
  } else if (direction === "toSQLite" || direction === "fromSupabase") {
    // Supabase → SQLite: true/false → 1/0; JSONB/objects → TEXT
    Object.keys(normalized).forEach((key) => {
      const value = normalized[key];
      if (typeof value === "boolean") {
        normalized[key] = value ? 1 : 0;
      } else if (value === undefined) {
        normalized[key] = null;
      } else if (value !== null && typeof value === "object") {
        if (value instanceof Date) {
          normalized[key] = value.toISOString();
        } else if (!Buffer.isBuffer(value)) {
          normalized[key] = JSON.stringify(value);
        }
      }
    });
  }

  return normalized;
}

/**
 * Generate consistent UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function getDeviceId(): string {
  if (isServerSide()) {
    return process.env.SYNC_DEVICE_ID || "server-web";
  }

  try {
    const key = "sync_device_id";
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const id = `device-${crypto.randomUUID()}`;
    localStorage.setItem(key, id);
    return id;
  } catch {
    return `device-${crypto.randomUUID()}`;
  }
}

function withSyncMetadata(
  data: Record<string, any>,
  opts: { keepClientMutationId?: boolean } = {}
): Record<string, any> {
  const now = getCurrentTimestamp();
  const next = { ...data };
  next.updated_at_server = now;
  next.updated_by_device = getDeviceId();
  next.change_version =
    typeof next.change_version === "number" ? next.change_version + 1 : 1;
  if (!opts.keepClientMutationId) {
    next.client_mutation_id =
      next.client_mutation_id || `${next.updated_by_device}-${crypto.randomUUID()}`;
  }
  if (typeof next.is_deleted === "undefined") next.is_deleted = 0;
  return next;
}

/**
 * When GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR=1, successful Supabase mutations on the
 * Next.js server skip writing to ./database/gemiprint.db (needed for serverless).
 */
function skipServerSqliteMirror(): boolean {
  return process.env.GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR === "1";
}

// Environment detection
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isTauriApp(): boolean {
  if (!isBrowser()) return false;
  return "__TAURI__" in window;
}

export function isServerSide(): boolean {
  return !isBrowser();
}

// Server-side SQLite connection (for Next.js API routes/server actions)
let serverSqliteDb: any = null;
const serverSqliteColumnsCache = new Map<string, Set<string>>();
const SYNC_V2_TABLES = [
  "kategori_barang",
  "subkategori_barang",
  "satuan_barang",
  "spesifikasi_cepat_barang",
  "barang",
  "harga_barang_satuan",
  "opsi_finishing",
  "pelanggan",
  "vendor",
  "profil",
  "kredensial",
  "penjualan",
  "item_penjualan",
  "pembelian",
  "item_pembelian",
  "piutang_penjualan",
  "pelunasan_piutang",
  "hutang_pembelian",
  "pelunasan_hutang",
  "order_produksi",
  "item_produksi",
  "item_finishing",
  "keuangan",
  "finance_category_definitions",
  "finance_participants",
  "finance_metric_mappings",
];

async function getServerSQLite(): Promise<any> {
  if (!isServerSide()) return null;

  if (!serverSqliteDb) {
    try {
      const Database = (await import("better-sqlite3")).default;
      const path = await import("path");
      const dbPath = path.join(process.cwd(), "database", "gemiprint.db");
      serverSqliteDb = new Database(dbPath);
      serverSqliteDb.pragma("journal_mode = WAL");
      serverSqliteDb.pragma("foreign_keys = ON");
      ensureServerSQLiteSyncV2Schema(serverSqliteDb);
      console.log("✅ Server-side SQLite connected:", dbPath);
    } catch (error) {
      console.error("❌ Failed to initialize server SQLite:", error);
      return null;
    }
  }

  return serverSqliteDb;
}

/**
 * SQLite cannot ALTER a CHECK constraint. Older installs created actor_roles
 * with role_group IN ('profit_share','cash_advance','bonus','other').
 * Recreate the table without that constraint and map legacy values to the
 * new display categories (owner / management / sales / staff / other).
 */
function migrateActorRolesLegacyCheckConstraint(db: {
  prepare: (sql: string) => { get: () => { sql?: string } | undefined };
  pragma: (s: string) => void;
  exec: (sql: string) => void;
}): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'actor_roles'"
    )
    .get();
  if (!row?.sql?.includes("profit_share")) return;

  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE actor_roles_v2 (
      id            TEXT PRIMARY KEY,
      role_code     TEXT NOT NULL UNIQUE,
      role_label    TEXT NOT NULL,
      role_group    TEXT NOT NULL DEFAULT 'other',
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO actor_roles_v2
      (id, role_code, role_label, role_group, description, display_order, created_at, updated_at)
    SELECT
      id,
      role_code,
      role_label,
      CASE role_group
        WHEN 'profit_share' THEN 'owner'
        WHEN 'cash_advance' THEN 'staff'
        WHEN 'bonus' THEN
          CASE role_code
            WHEN 'SALES' THEN 'sales'
            WHEN 'MANAGER' THEN 'management'
            WHEN 'SUPERVISOR' THEN 'management'
            ELSE 'management'
          END
        ELSE 'other'
      END,
      description,
      display_order,
      created_at,
      updated_at
    FROM actor_roles;

    DROP TABLE actor_roles;
    ALTER TABLE actor_roles_v2 RENAME TO actor_roles;
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_actor_roles_group ON actor_roles(role_group);
    CREATE INDEX IF NOT EXISTS idx_actor_roles_order ON actor_roles(display_order);
  `);
  db.pragma("foreign_keys = ON");
  console.log(
    "✅ Migrated actor_roles: role_group is now owner/management/sales/staff/other"
  );
}

function ensureServerSQLiteSyncV2Schema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_category_definitions (
      id TEXT PRIMARY KEY,
      category_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      color_bg TEXT NOT NULL DEFAULT 'bg-gray-100',
      color_text TEXT NOT NULL DEFAULT 'text-gray-800',
      color_border TEXT NOT NULL DEFAULT 'border-gray-300',
      direction TEXT NOT NULL DEFAULT 'both' CHECK(direction IN ('debit', 'kredit', 'both')),
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS finance_participants (
      id TEXT PRIMARY KEY,
      participant_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role_type TEXT NOT NULL DEFAULT 'other',
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      profit_formula TEXT,
      share_divisor INTEGER DEFAULT 3,
      bagi_hasil_column TEXT,
      kasbon_column TEXT,
      pribadi_kategori TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS finance_metric_mappings (
      id TEXT PRIMARY KEY,
      metric_key TEXT NOT NULL UNIQUE,
      metric_label TEXT NOT NULL,
      metric_group TEXT NOT NULL,
      source_column TEXT NOT NULL,
      participant_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending',
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      FOREIGN KEY (participant_id) REFERENCES finance_participants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS finance_metric_column_rules (
      id TEXT PRIMARY KEY,
      column_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      rule_type TEXT NOT NULL DEFAULT 'accumulator',
      formula_expression TEXT,
      kasbon_conditions TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- AST-backed user-editable formulas (new visual-builder system).
    CREATE TABLE IF NOT EXISTS cashbook_formula (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      column_key TEXT NOT NULL UNIQUE,
      db_column TEXT NOT NULL,
      ast TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cashbook_formula_order
      ON cashbook_formula(display_order);

    CREATE TABLE IF NOT EXISTS cashbook_partner (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cashbook_partner_order
      ON cashbook_partner(display_order);

    -- ── business_actors v2 (generic, name-free architecture) ─────────────
    -- Coexists with finance_participants + cashbook_partner during the
    -- migration window. See supabase/migrations/20260521090000_business_actors_v2.sql
    -- role_group is a display category for organising job titles in the UI.
    -- It does NOT restrict formula types — any actor can have profit share,
    -- kasbon, and bonus simultaneously regardless of their role.
    CREATE TABLE IF NOT EXISTS actor_roles (
      id            TEXT PRIMARY KEY,
      role_code     TEXT NOT NULL UNIQUE,
      role_label    TEXT NOT NULL,
      role_group    TEXT NOT NULL DEFAULT 'other',
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_actor_roles_group ON actor_roles(role_group);
    CREATE INDEX IF NOT EXISTS idx_actor_roles_order ON actor_roles(display_order);

    CREATE TABLE IF NOT EXISTS business_actors (
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
      FOREIGN KEY (role_code) REFERENCES actor_roles(role_code) ON UPDATE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_business_actors_role   ON business_actors(role_code);
    CREATE INDEX IF NOT EXISTS idx_business_actors_active ON business_actors(is_active);
    CREATE INDEX IF NOT EXISTS idx_business_actors_order  ON business_actors(display_order);

    CREATE TABLE IF NOT EXISTS transaction_computed (
      transaction_id TEXT NOT NULL,
      formula_key    TEXT NOT NULL,
      value          REAL NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (transaction_id, formula_key),
      FOREIGN KEY (transaction_id) REFERENCES keuangan(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tc_formula_key ON transaction_computed(formula_key);
    CREATE INDEX IF NOT EXISTS idx_tc_transaction ON transaction_computed(transaction_id);

    CREATE TABLE IF NOT EXISTS transaction_overrides (
      transaction_id  TEXT NOT NULL,
      formula_key     TEXT NOT NULL,
      override_value  REAL NOT NULL,
      overridden_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (transaction_id, formula_key),
      FOREIGN KEY (transaction_id) REFERENCES keuangan(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_to_formula_key ON transaction_overrides(formula_key);
  `);

  // Recreate actor_roles when an older CHECK constraint blocks new group values.
  migrateActorRolesLegacyCheckConstraint(db);

  // Upsert seed roles so existing installs get updated role_group values.
  // role_group is a display-only category; it does not restrict formula types.
  db.exec(`
    INSERT INTO actor_roles
      (id, role_code, role_label, role_group, description, display_order) VALUES
      ('role-pemilik',    'PEMILIK',    'Pemilik / Investor',   'owner',      'Pemilik atau investor usaha',                10),
      ('role-direktur',   'DIREKTUR',   'Direktur',             'owner',      'Direksi / direktur',                         20),
      ('role-komisaris',  'KOMISARIS',  'Komisaris',            'owner',      'Komisaris / pengawas',                       30),
      ('role-manager',    'MANAGER',    'Manager',              'management', 'Manajer cabang / divisi',                    40),
      ('role-supervisor', 'SUPERVISOR', 'Supervisor',           'management', 'Pengawas operasional',                       50),
      ('role-sales',      'SALES',      'Sales / Marketing',    'sales',      'Tenaga penjual / pemasaran',                 60),
      ('role-karyawan',   'KARYAWAN',   'Karyawan tetap',       'staff',      'Karyawan tetap',                             70),
      ('role-designer',   'DESIGNER',   'Designer / Operator',  'staff',      'Tenaga kreatif / operator cetak',            80),
      ('role-kasir',      'KASIR',      'Kasir / Front office', 'staff',      'Petugas kasir / front office',               90),
      ('role-kurir',      'KURIR',      'Kurir / Driver',       'staff',      'Pengantar / driver',                        100),
      ('role-lainnya',    'LAINNYA',    'Lainnya',              'other',      'Peran lain yang tidak tercakup di atas',    110)
    ON CONFLICT(role_code) DO UPDATE SET
      role_group  = excluded.role_group,
      description = excluded.description;
  `);

  // ── Backfill new columns on cashbook_formula (mirror Supabase migration) ─
  // Adds formula_key / actor_id / formula_group additively so the legacy
  // letter-keyed system keeps working while the new semantic system rolls in.
  const cashbookFormulaCols = (
    db.prepare("PRAGMA table_info(cashbook_formula)").all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);

  if (cashbookFormulaCols.length > 0) {
    if (!cashbookFormulaCols.includes("formula_key")) {
      db.exec(`ALTER TABLE cashbook_formula ADD COLUMN formula_key TEXT`);
      db.exec(`UPDATE cashbook_formula SET formula_key = db_column WHERE formula_key IS NULL`);
    }
    if (!cashbookFormulaCols.includes("actor_id")) {
      db.exec(`ALTER TABLE cashbook_formula ADD COLUMN actor_id TEXT`);
    }
    if (!cashbookFormulaCols.includes("formula_group")) {
      db.exec(
        `ALTER TABLE cashbook_formula ADD COLUMN formula_group TEXT NOT NULL DEFAULT 'custom'`
      );
      db.exec(`UPDATE cashbook_formula
                 SET formula_group = 'summary'
                 WHERE db_column IN ('omzet', 'biaya_operasional', 'biaya_bahan', 'saldo', 'laba_bersih')
                   AND formula_group = 'custom'`);
      db.exec(`UPDATE cashbook_formula
                 SET formula_group = 'profit_share'
                 WHERE db_column LIKE 'bagi_hasil_%'
                   AND formula_group = 'custom'`);
      db.exec(`UPDATE cashbook_formula
                 SET formula_group = 'cash_advance'
                 WHERE db_column LIKE 'kasbon_%'
                   AND formula_group = 'custom'`);
    }
    if (!cashbookFormulaCols.includes("is_visible_in_summary")) {
      db.exec(
        `ALTER TABLE cashbook_formula ADD COLUMN is_visible_in_summary INTEGER NOT NULL DEFAULT 0`
      );
      // Mirror the Supabase default: actor-driven groups visible, others hidden.
      db.exec(`UPDATE cashbook_formula
                 SET is_visible_in_summary = 1
                 WHERE formula_group IN ('profit_share', 'cash_advance', 'bonus')`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_cashbook_formula_key   ON cashbook_formula(formula_key);
             CREATE INDEX IF NOT EXISTS idx_cashbook_formula_actor ON cashbook_formula(actor_id);
             CREATE INDEX IF NOT EXISTS idx_cashbook_formula_group ON cashbook_formula(formula_group);`);

    // Per-person formulas without a linked actor are legacy seed data —
    // hard-delete them so they don't clutter the Kolom and Rumus tabs.
    // System formulas (formula_group = 'summary') are preserved.
    db.exec(`
      DELETE FROM cashbook_formula
      WHERE actor_id IS NULL
        AND COALESCE(is_system, 0) = 0
        AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
    `);

    // cashbook_partner is purely legacy in the v2 architecture (replaced by
    // business_actors). Drop every row so old "Cahaya/Suri/Gemi" partners
    // don't appear in any UI.
    db.exec(`DELETE FROM cashbook_partner`);

    // Hardcoded "PRIBADI-A" / "PRIBADI-S" categories were seeded for the
    // original Anwar/Suri kasbon split. Remove them from new installs and
    // existing databases — users can recreate categories with their own
    // names via tab Kategori.
    db.exec(`
      DELETE FROM finance_category_definitions
      WHERE category_code IN ('PRIBADI-A', 'PRIBADI-S')
    `);
  }

  // Default formula + partner seeding happens lazily from
  // `cashbook-formula-service.seedDefaultsIfEmpty()` (called from the API
  // route + on first list). Keeping schema bootstrap import-free avoids a
  // circular dependency with the AST module.

  // Add metric_contributions column to finance_category_definitions if missing
  const catCols = (
    db.prepare("PRAGMA table_info(finance_category_definitions)").all() as Array<{ name: string }>
  ).map((c) => c.name);
  if (catCols.length > 0 && !catCols.includes("metric_contributions")) {
    db.exec(`ALTER TABLE finance_category_definitions ADD COLUMN metric_contributions TEXT`);
  }

  // Seed column rules if table is empty
  const ruleCount = (db.prepare("SELECT COUNT(*) AS c FROM finance_metric_column_rules").get() as { c: number }).c;
  if (ruleCount === 0) {
    db.exec(`
      INSERT OR IGNORE INTO finance_metric_column_rules (id, column_name, display_name, rule_type, formula_expression, kasbon_conditions, is_system, display_order) VALUES
        ('rule-saldo','saldo','Saldo','saldo',NULL,NULL,1,10),
        ('rule-omzet','omzet','Omzet','accumulator',NULL,NULL,0,20),
        ('rule-biaya-ops','biaya_operasional','Biaya Operasional','accumulator',NULL,NULL,0,30),
        ('rule-biaya-bahan','biaya_bahan','Biaya Bahan','accumulator',NULL,NULL,0,40),
        ('rule-laba','laba_bersih','Laba Bersih','formula','omzet - biaya_operasional - biaya_bahan',NULL,0,50),
        ('rule-kasbon-anwar','kasbon_anwar','Kasbon Mitra 1','kasbon_conditional',NULL,'{"categories":["PRIBADI-A"],"keperluan_contains":null,"amount":"kredit_minus_debit"}',0,60),
        ('rule-kasbon-suri','kasbon_suri','Kasbon Mitra 2','kasbon_conditional',NULL,'{"categories":["PRIBADI-S"],"keperluan_contains":null,"amount":"kredit_minus_debit"}',0,70),
        ('rule-kasbon-cahaya','kasbon_cahaya','Kasbon Karyawan 1','kasbon_conditional',NULL,'{"categories":["INVESTOR","BIAYA"],"keperluan_contains":"cahaya","amount":"kredit_minus_debit"}',0,80),
        ('rule-kasbon-dinil','kasbon_dinil','Kasbon Karyawan 2','kasbon_conditional',NULL,'{"categories":["INVESTOR","BIAYA"],"keperluan_contains":"dinil","amount":"kredit_minus_debit"}',0,90),
        ('rule-bagi-hasil-anwar','bagi_hasil_anwar','Bagi Hasil Slot 1','profit_share',NULL,NULL,1,100),
        ('rule-bagi-hasil-suri','bagi_hasil_suri','Bagi Hasil Slot 2','profit_share',NULL,NULL,1,110),
        ('rule-bagi-hasil-gemi','bagi_hasil_gemi','Bagi Hasil Slot 3','profit_share',NULL,NULL,1,120);

      UPDATE finance_category_definitions
        SET metric_contributions = '[{"column":"omzet","amount_field":"debit","sign":1}]'
        WHERE category_code IN ('OMZET','PIUTANG','LUNAS') AND metric_contributions IS NULL;
      UPDATE finance_category_definitions
        SET metric_contributions = '[{"column":"biaya_operasional","amount_field":"kredit","sign":1}]'
        WHERE category_code IN ('BIAYA','TABUNGAN','KOMISI') AND metric_contributions IS NULL;
      UPDATE finance_category_definitions
        SET metric_contributions = '[{"column":"biaya_bahan","amount_field":"kredit","sign":1}]'
        WHERE category_code IN ('SUPPLY','HUTANG') AND metric_contributions IS NULL;
    `);
  }

  const fpCols = (
    db.prepare("PRAGMA table_info(finance_participants)").all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  if (fpCols.length > 0) {
    if (!fpCols.includes("profit_formula")) {
      db.exec(`ALTER TABLE finance_participants ADD COLUMN profit_formula TEXT`);
    }
    if (!fpCols.includes("share_divisor")) {
      db.exec(
        `ALTER TABLE finance_participants ADD COLUMN share_divisor INTEGER DEFAULT 3`
      );
    }
    if (!fpCols.includes("bagi_hasil_column")) {
      db.exec(
        `ALTER TABLE finance_participants ADD COLUMN bagi_hasil_column TEXT`
      );
    }
    if (!fpCols.includes("kasbon_column")) {
      db.exec(`ALTER TABLE finance_participants ADD COLUMN kasbon_column TEXT`);
    }
    if (!fpCols.includes("pribadi_kategori")) {
      db.exec(
        `ALTER TABLE finance_participants ADD COLUMN pribadi_kategori TEXT`
      );
    }
    if (!fpCols.includes("participant_role")) {
      db.exec(
        `ALTER TABLE finance_participants ADD COLUMN participant_role TEXT DEFAULT 'PEMILIK'`
      );
    }
    if (!fpCols.includes("share_percent")) {
      db.exec(
        `ALTER TABLE finance_participants ADD COLUMN share_percent REAL DEFAULT 100`
      );
    }
    db.exec(`
      UPDATE finance_participants SET
        profit_formula = 'third_minus_kasbon', share_divisor = 3,
        bagi_hasil_column = 'bagi_hasil_anwar', kasbon_column = 'kasbon_anwar',
        pribadi_kategori = 'PRIBADI-A'
      WHERE id = 'fin-participant-anwar' AND profit_formula IS NULL;
      UPDATE finance_participants SET
        profit_formula = 'third_minus_kasbon', share_divisor = 3,
        bagi_hasil_column = 'bagi_hasil_suri', kasbon_column = 'kasbon_suri',
        pribadi_kategori = 'PRIBADI-S'
      WHERE id = 'fin-participant-suri' AND profit_formula IS NULL;
      UPDATE finance_participants SET
        profit_formula = 'incremental_investor', share_divisor = 3,
        bagi_hasil_column = 'bagi_hasil_gemi'
      WHERE id = 'fin-participant-gemi' AND profit_formula IS NULL;
      UPDATE finance_participants SET display_name = 'Mitra bagi hasil 1'
      WHERE id = 'fin-participant-anwar' AND display_name IN ('Anwar', 'anwar', 'ANWAR');
      UPDATE finance_participants SET display_name = 'Mitra bagi hasil 2'
      WHERE id = 'fin-participant-suri' AND display_name IN ('Suri', 'suri', 'SURI');
      UPDATE finance_participants SET display_name = 'Mitra bagi hasil 3'
      WHERE id = 'fin-participant-gemi' AND display_name IN ('Gemi', 'gemi', 'GEMI');
      UPDATE finance_participants SET display_name = 'Karyawan kasbon 1'
      WHERE id = 'fin-participant-cahaya' AND display_name IN ('Cahaya', 'cahaya', 'CAHAYA');
      UPDATE finance_participants SET display_name = 'Karyawan kasbon 2'
      WHERE id = 'fin-participant-dinil' AND display_name IN ('Dinil', 'dinil', 'DINIL');
    `);
  }

  for (const tableName of SYNC_V2_TABLES) {
    const tableExists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(tableName);
    if (!tableExists) continue;

    const columns = (
      db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);

    if (!columns.includes("updated_at_server")) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN updated_at_server TEXT`);
      const fallbackTimestampExpr = columns.includes("diperbarui_pada")
        ? "diperbarui_pada"
        : columns.includes("dibuat_pada")
          ? "dibuat_pada"
          : "datetime('now')";
      db.exec(
        `UPDATE ${tableName} SET updated_at_server = COALESCE(updated_at_server, ${fallbackTimestampExpr})`
      );
    }
    if (!columns.includes("updated_by_device")) {
      db.exec(
        `ALTER TABLE ${tableName} ADD COLUMN updated_by_device TEXT DEFAULT 'server'`
      );
    }
    if (!columns.includes("change_version")) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN change_version INTEGER DEFAULT 1`);
    }
    if (!columns.includes("is_deleted")) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    }
    if (!columns.includes("deleted_at")) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN deleted_at TEXT`);
    }
    if (!columns.includes("client_mutation_id")) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN client_mutation_id TEXT`);
    }

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at_server ON ${tableName}(updated_at_server)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_change_version ON ${tableName}(change_version)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_is_deleted ON ${tableName}(is_deleted)`
    );
  }

  // ── Dimensional inventory: panjang/lebar on item_pembelian + m² unit ─────
  // Mirror of supabase migration 20260522093000_dimension_inventory_in_m2.sql.
  // Materials with butuh_dimensi_status track stock in m², so purchase rows
  // need to record the physical roll dimensions of each invoice line.
  const itemPembelianExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'item_pembelian' LIMIT 1"
    )
    .get();
  if (itemPembelianExists) {
    const ipCols = (
      db.prepare("PRAGMA table_info(item_pembelian)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    if (!ipCols.includes("panjang")) {
      db.exec(`ALTER TABLE item_pembelian ADD COLUMN panjang REAL`);
    }
    if (!ipCols.includes("lebar")) {
      db.exec(`ALTER TABLE item_pembelian ADD COLUMN lebar REAL`);
    }
  }

  // Moving average inventory costing + HPP snapshots. Additive migration for
  // existing local SQLite installs; new template schemas already include these.
  const barangExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'barang' LIMIT 1"
    )
    .get();
  if (barangExists) {
    const barangCols = (
      db.prepare("PRAGMA table_info(barang)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!barangCols.includes("average_cost_per_base_unit")) {
      db.exec(`ALTER TABLE barang ADD COLUMN average_cost_per_base_unit REAL DEFAULT 0`);
      db.exec(`
        UPDATE barang
        SET average_cost_per_base_unit = COALESCE(
          NULLIF(average_cost_per_base_unit, 0),
          COALESCE((
            SELECT h.harga_beli / NULLIF(h.faktor_konversi, 0)
            FROM harga_barang_satuan h
            WHERE h.barang_id = barang.id
            ORDER BY h.default_status DESC, h.faktor_konversi ASC, h.urutan_tampilan ASC
            LIMIT 1
          ), 0)
        )
      `);
    }
  }

  const itemPenjualanExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'item_penjualan' LIMIT 1"
    )
    .get();
  if (itemPenjualanExists) {
    const ijCols = (
      db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    if (!ijCols.includes("hpp_satuan")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN hpp_satuan REAL DEFAULT 0`);
    }
    if (!ijCols.includes("hpp_total")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN hpp_total REAL DEFAULT 0`);
    }
    if (!ijCols.includes("gross_profit")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN gross_profit REAL DEFAULT 0`);
    }
    if (!ijCols.includes("gross_margin")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN gross_margin REAL DEFAULT 0`);
    }
  }

  const hppAst = `{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"I"}}}`;
  const financeCategoryExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'finance_category_definitions' LIMIT 1"
    )
    .get();
  if (financeCategoryExists) {
    const catCols = (
      db.prepare("PRAGMA table_info(finance_category_definitions)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    const hasMetricContrib = catCols.includes("metric_contributions");
    const hppValues = hasMetricContrib
      ? `('fin-cat-hpp', 'HPP', 'Harga Pokok Penjualan', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'kredit', 1, 75, '[{"column":"biaya_bahan","amount_field":"kredit","sign":1}]')`
      : `('fin-cat-hpp', 'HPP', 'Harga Pokok Penjualan', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'kredit', 1, 75)`;
    const hppColumns = hasMetricContrib
      ? `(id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order, metric_contributions)`
      : `(id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order)`;
    db.exec(`
      INSERT OR IGNORE INTO finance_category_definitions ${hppColumns}
      VALUES ${hppValues};
      UPDATE finance_category_definitions
      SET display_name = 'Harga Pokok Penjualan'
      WHERE category_code = 'HPP';
      ${
        hasMetricContrib
          ? `UPDATE finance_category_definitions
             SET metric_contributions = '[{"column":"biaya_bahan","amount_field":"kredit","sign":1}]'
             WHERE category_code = 'HPP';
             UPDATE finance_category_definitions
             SET metric_contributions = NULL
             WHERE category_code IN ('SUPPLY','HUTANG');`
          : ""
      }
    `);
  }

  const cashbookFormulaExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'cashbook_formula' LIMIT 1"
    )
    .get();
  if (cashbookFormulaExists) {
    db.prepare(
      `UPDATE cashbook_formula
       SET ast = ?, description = 'Akumulasi HPP dari barang yang terjual.'
       WHERE db_column = 'biaya_bahan'`
    ).run(hppAst);
  }

  const satuanExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'satuan_barang' LIMIT 1"
    )
    .get();
  if (satuanExists) {
    // Check if m² already exists with a different id (user created it manually
    // via Settings before this migration ran). If so, rename that row's id to
    // 'unit-m2' so it matches the canonical cloud seed id and future syncs
    // don't hit the UNIQUE(nama) constraint.
    const existingM2 = db
      .prepare(`SELECT id FROM satuan_barang WHERE nama = 'm²' LIMIT 1`)
      .get() as { id: string } | undefined;

    if (existingM2 && existingM2.id !== "unit-m2") {
      // Update all FK references first (harga_barang_satuan uses nama_satuan
      // text, not id, so no FK to update). Then rename the id.
      db.exec(`UPDATE satuan_barang SET id = 'unit-m2' WHERE nama = 'm²'`);
    } else if (!existingM2) {
      db.exec(`
        INSERT OR IGNORE INTO satuan_barang (id, nama, urutan_tampilan)
        VALUES ('unit-m2', 'm²', 0);
      `);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      conflict_type TEXT NOT NULL DEFAULT 'lww',
      winner_source TEXT NOT NULL,
      loser_source TEXT NOT NULL,
      winner_payload TEXT NOT NULL,
      loser_payload TEXT NOT NULL,
      winner_updated_at_server TEXT,
      loser_updated_at_server TEXT,
      resolved_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_table_record
      ON sync_conflicts(table_name, record_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS sync_mutation_registry (
      id TEXT PRIMARY KEY,
      client_mutation_id TEXT NOT NULL UNIQUE,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      payload_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_mutation_registry_table_record
      ON sync_mutation_registry(table_name, record_id, processed_at DESC);

    CREATE TABLE IF NOT EXISTS device_registry (
      device_id TEXT PRIMARY KEY,
      device_type TEXT NOT NULL,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT
    );
  `);
  serverSqliteColumnsCache.clear();
}

async function getServerSQLiteTableColumns(table: string): Promise<Set<string>> {
  const cached = serverSqliteColumnsCache.get(table);
  if (cached) {
    return cached;
  }

  const db = await getServerSQLite();
  if (!db) {
    return new Set();
  }

  try {
    // PRAGMA table_info returns the canonical list of columns for the table.
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    const columns = new Set(rows.map((row) => row.name));
    serverSqliteColumnsCache.set(table, columns);
    return columns;
  } catch (error) {
    console.warn(`Failed to introspect columns for table ${table}:`, error);
    return new Set();
  }
}

// Supabase client initialization (Browser)
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!isBrowser() || WEB_SERVER_MEDIATED_ONLY) return null;

  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      console.warn("⚠️ Supabase not configured");
      return null;
    }

    supabaseClient = createClient(url, anonKey);
  }

  return supabaseClient;
}

// Supabase client for Server-side
let serverSupabaseClient: SupabaseClient | null = null;

/** Exported for server-side services that need PostgREST directly (Vercel / Supabase-only paths). */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (!isServerSide()) return null;

  if (!serverSupabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
      console.warn("⚠️ Server Supabase not configured");
      return null;
    }

    serverSupabaseClient = createClient(url, serviceKey);
    console.log("✅ Server-side Supabase connected");
  }

  return serverSupabaseClient;
}

// Check if online and Supabase is available (Browser)
let onlineStatus: boolean | null = null;
let lastOnlineCheck = 0;
const ONLINE_CHECK_INTERVAL = 5000; // 5 seconds

async function isOnline(): Promise<boolean> {
  if (!isBrowser()) return false;

  const now = Date.now();
  if (onlineStatus !== null && now - lastOnlineCheck < ONLINE_CHECK_INTERVAL) {
    return onlineStatus;
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase
      .from("profil")
      .select("id")
      .limit(1)
      .single();

    onlineStatus = !error;
    lastOnlineCheck = now;
    return onlineStatus;
  } catch {
    onlineStatus = false;
    lastOnlineCheck = now;
    return false;
  }
}

// Check if Supabase is available (Server-side)
let serverOnlineStatus: boolean | null = null;
let lastServerOnlineCheck = 0;

/**
 * Whether to skip the per-process Supabase health check ping.
 *
 * On Vercel (or any serverless host) every cold function would otherwise
 * issue an extra `SELECT id FROM profil LIMIT 1` before the real query,
 * adding ~100-300 ms of round trip latency. When VERCEL=1 or the env flag
 * GEMIPRINT_SKIP_SUPABASE_HEALTHCHECK=1 is set we assume Supabase is
 * available and fall back to SQLite only if the actual query errors.
 */
function shouldSkipServerHealthCheck(): boolean {
  if (process.env.GEMIPRINT_SKIP_SUPABASE_HEALTHCHECK === "1") return true;
  if (process.env.VERCEL === "1") return true;
  return false;
}

async function isServerSupabaseAvailable(): Promise<boolean> {
  if (!isServerSide()) return false;

  if (shouldSkipServerHealthCheck()) {
    const supabase = getServerSupabaseClient();
    return !!supabase;
  }

  const now = Date.now();
  if (
    serverOnlineStatus !== null &&
    now - lastServerOnlineCheck < ONLINE_CHECK_INTERVAL
  ) {
    return serverOnlineStatus;
  }

  try {
    const supabase = getServerSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase.from("profil").select("id").limit(1);

    serverOnlineStatus = !error;
    lastServerOnlineCheck = now;

    if (serverOnlineStatus) {
      console.log("🌐 Supabase online - using cloud database");
    } else {
      if (error) {
        console.warn("📴 Supabase profil check failed:", error.message, error);
      }
      console.log("📴 Supabase offline - using local SQLite");
    }

    return serverOnlineStatus;
  } catch (err) {
    console.log("📴 Supabase connection failed - using local SQLite");
    serverOnlineStatus = false;
    lastServerOnlineCheck = now;
    return false;
  }
}

// ============================================================================
// OFFLINE QUEUE (Unified Format)
// ============================================================================

/**
 * Unified queue operation structure
 * Used for Web (localStorage) and Tauri (sync_queue table)
 */
export interface QueuedOperation {
  id: string;
  timestamp: number;
  table: string;
  operation: "insert" | "update" | "delete";
  data?: any;
  recordId?: string;
  attempts?: number;
  lastError?: string;
}

/**
 * UNIFIED QUEUE KEY - single source of truth for web offline queue
 */
const OFFLINE_QUEUE_KEY = "offline_queue";

function getOfflineQueue(): QueuedOperation[] {
  if (!isBrowser() || isTauriApp()) return [];

  try {
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch {
    return [];
  }
}

function addToOfflineQueue(op: Omit<QueuedOperation, "id" | "timestamp">) {
  if (!isBrowser() || isTauriApp()) return;

  try {
    const queue = getOfflineQueue();
    const newOp: QueuedOperation = {
      ...op,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      attempts: 0,
    };
    queue.push(newOp);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`📝 Queued offline operation:`, newOp);
  } catch (e) {
    console.error("Failed to queue operation:", e);
  }
}

export function clearOfflineQueue() {
  if (!isBrowser() || isTauriApp()) return;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}

/**
 * Get count of pending operations in queue
 */
export function getPendingQueueCount(): number {
  if (isTauriApp()) {
    // For Tauri, invoked via Rust command
    return 0;
  }
  return getOfflineQueue().length;
}

// Main Database Interface
export interface QueryOptions {
  select?: string;
  where?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
}

export interface QueryResult<T = any> {
  data: T[] | null;
  error: Error | null;
}

export interface SingleResult<T = any> {
  data: T | null;
  error: Error | null;
}

export interface MutationResult {
  data: { id: string } | null;
  error: Error | null;
}

class UnifiedDatabase {
  /**
   * Query multiple records
   */
  async query<T = any>(
    table: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    try {
      // Tauri: Always use SQLite via Rust
      if (isTauriApp()) {
        return await this.queryTauri<T>(table, options);
      }

      // Server-side: Try Supabase first, fallback to SQLite
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const result = await this.queryServerSupabase<T>(table, options);
          if (!result.error) {
            return result;
          }
          console.warn(`⚠️ Supabase query failed, falling back to SQLite`);
        }
        return await this.queryServerSQLite<T>(table, options);
      }

      // Web/Browser: Try Supabase first, fallback to cached data
      const online = await isOnline();
      if (online) {
        return await this.querySupabase<T>(table, options);
      }

      // Offline: Return cached data if available
      console.warn(`⚠️ Offline mode: Cannot query ${table}`);
      return {
        data: this.getCachedData<T>(table),
        error: new Error("Offline - showing cached data"),
      };
    } catch (error: any) {
      console.error(`Query error on ${table}:`, error);
      return { data: null, error };
    }
  }

  /**
   * Query single record
   */
  async queryOne<T = any>(
    table: string,
    options: QueryOptions = {}
  ): Promise<SingleResult<T>> {
    const result = await this.query<T>(table, { ...options, limit: 1 });

    if (result.error) {
      return { data: null, error: result.error };
    }

    return {
      data: result.data && result.data.length > 0 ? result.data[0] : null,
      error: null,
    };
  }

  /**
   * Insert record
   */
  async insert(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    try {
      // Generate ID if not provided
      if (!data.id) {
        data.id = generateId();
      }

      // Add timestamps (standar Indonesia: dibuat_pada, diperbarui_pada)
      const now = getCurrentTimestamp();
      data.dibuat_pada = data.dibuat_pada || now;
      data.diperbarui_pada = data.diperbarui_pada || now;
      data = withSyncMetadata(data);

      // Tauri: Insert to SQLite
      if (isTauriApp()) {
        const result = await this.insertTauri(table, data);
        // Queue for background sync to Supabase
        this.queueTauriSync(table, "insert", data);
        return result;
      }

      // Server-side: Try Supabase first, fallback to SQLite
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const result = await this.insertServerSupabase(table, data);
          if (!result.error) {
            if (!skipServerSqliteMirror()) {
              await this.insertServerSQLite(table, data);
            }
            return result;
          }
          console.warn(`⚠️ Supabase insert failed, falling back to SQLite`);
        }
        // If offline, queue for later sync
        if (!supabaseAvailable) {
          await this.queueToLocalSync(table, "insert", data);
        }
        return await this.insertServerSQLite(table, data);
      }

      // Web: server mediated mode avoids direct browser Supabase writes
      if (WEB_SERVER_MEDIATED_ONLY) {
        addToOfflineQueue({ table, operation: "insert", data });
        return { data: { id: data.id }, error: null };
      }

      // Web: Try Supabase first
      const online = await isOnline();
      if (online) {
        return await this.insertSupabase(table, data);
      }

      // Offline: Queue for later
      addToOfflineQueue({ table, operation: "insert", data });
      return { data: { id: data.id }, error: null };
    } catch (error: any) {
      console.error(`Insert error on ${table}:`, error);
      return { data: null, error };
    }
  }

  /**
   * Update record
   */
  async update(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    try {
      // Update timestamp (standar Indonesia: diperbarui_pada)
      data.diperbarui_pada = getCurrentTimestamp();
      data = withSyncMetadata(data);

      // Remove id from update data
      const { id: _, ...updateData } = data;

      // Tauri: Update SQLite
      if (isTauriApp()) {
        const result = await this.updateTauri(table, id, updateData);
        // Queue for background sync to Supabase
        this.queueTauriSync(table, "update", updateData, id);
        return result;
      }

      // Server-side: Try Supabase first, fallback to SQLite
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const result = await this.updateServerSupabase(table, id, updateData);
          if (!result.error) {
            if (!skipServerSqliteMirror()) {
              await this.updateServerSQLite(table, id, updateData);
            }
            return result;
          }
          console.warn(`⚠️ Supabase update failed, falling back to SQLite`);
        }
        // If offline, queue for later sync
        if (!supabaseAvailable) {
          await this.queueToLocalSync(table, "update", updateData, id);
        }
        return await this.updateServerSQLite(table, id, updateData);
      }

      // Web: server mediated mode avoids direct browser Supabase writes
      if (WEB_SERVER_MEDIATED_ONLY) {
        addToOfflineQueue({
          table,
          operation: "update",
          data: updateData,
          recordId: id,
        });
        return { data: { id }, error: null };
      }

      // Web: Try Supabase first
      const online = await isOnline();
      if (online) {
        return await this.updateSupabase(table, id, updateData);
      }

      // Offline: Queue for later
      addToOfflineQueue({
        table,
        operation: "update",
        data: updateData,
        recordId: id,
      });
      return { data: { id }, error: null };
    } catch (error: any) {
      console.error(`Update error on ${table}:`, error);
      return { data: null, error };
    }
  }

  /**
   * Delete record
   */
  async delete(table: string, id: string): Promise<MutationResult> {
    try {
      // Tauri: Delete from SQLite
      if (isTauriApp()) {
        const result = await this.deleteTauri(table, id);
        // Queue for background sync to Supabase
        this.queueTauriSync(table, "delete", null, id);
        return result;
      }

      // Server-side: Try Supabase first, fallback to SQLite
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const result = await this.deleteServerSupabase(table, id);
          if (!result.error) {
            if (!skipServerSqliteMirror()) {
              await this.deleteServerSQLite(table, id);
            }
            return result;
          }
          console.warn(`⚠️ Supabase delete failed, falling back to SQLite`);
        }
        // If offline, queue for later sync
        if (!supabaseAvailable) {
          await this.queueToLocalSync(table, "delete", null, id);
        }
        return await this.deleteServerSQLite(table, id);
      }

      // Web: server mediated mode avoids direct browser Supabase writes
      if (WEB_SERVER_MEDIATED_ONLY) {
        addToOfflineQueue({
          table,
          operation: "delete",
          recordId: id,
        });
        return { data: { id }, error: null };
      }

      // Web: Try Supabase first
      const online = await isOnline();
      if (online) {
        return await this.deleteSupabase(table, id);
      }

      // Offline: Queue for later
      addToOfflineQueue({
        table,
        operation: "delete",
        recordId: id,
      });
      return { data: { id }, error: null };
    } catch (error: any) {
      console.error(`Delete error on ${table}:`, error);
      return { data: null, error };
    }
  }

  // === Server-side SQLite Operations ===

  private async queryServerSQLite<T>(
    table: string,
    options: QueryOptions
  ): Promise<QueryResult<T>> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    let sql = `SELECT ${options.select || "*"} FROM ${table}`;
    const params: any[] = [];

    // Build WHERE clause
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.entries(options.where).map(([key, value]) => {
        if (value === null) {
          return `${key} IS NULL`;
        }
        params.push(value);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add ORDER BY
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy.column} ${
        options.orderBy.ascending !== false ? "ASC" : "DESC"
      }`;
    }

    // Add LIMIT and OFFSET
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    try {
      const stmt = db.prepare(sql);
      const data = stmt.all(...params) as T[];
      return { data, error: null };
    } catch (error: any) {
      console.error("Server SQLite query error:", error);
      return { data: null, error };
    }
  }

  private async insertServerSQLite(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    const filteredEntries = Object.entries(data).filter(([key]) => {
      // If introspection fails, keep previous behavior.
      if (tableColumns.size === 0) return true;
      return tableColumns.has(key);
    });

    const columns = filteredEntries.map(([key]) => key);
    const values = filteredEntries.map(([, value]) => value);
    if (columns.length === 0) {
      return {
        data: null,
        error: new Error(`No valid columns to insert for table ${table}`),
      };
    }
    const placeholders = columns.map(() => "?").join(", ");

    // OR IGNORE: if Supabase failed and fell back here, a prior attempt may have
    // already written the row — silently skip the duplicate rather than crashing.
    const sql = `INSERT OR IGNORE INTO ${table} (${columns.join(
      ", "
    )}) VALUES (${placeholders})`;

    try {
      const stmt = db.prepare(sql);
      const info = stmt.run(...values);
      if (info.changes === 0) {
        // Row was ignored due to a UNIQUE/PK conflict. Find and return the
        // existing row's ID so downstream foreign-key references stay valid.
        try {
          const existing = db
            .prepare(`SELECT id FROM ${table} WHERE id = ?`)
            .get(data.id);
          if (existing) return { data: { id: (existing as any).id }, error: null };
          // id not found — try by participant_code if available (finance_participants)
          if (data.participant_code) {
            const byCode = db
              .prepare(`SELECT id FROM ${table} WHERE participant_code = ?`)
              .get(data.participant_code);
            if (byCode) return { data: { id: (byCode as any).id }, error: null };
          }
        } catch {
          // best-effort lookup; fall through to return original id
        }
      }
      return { data: { id: data.id }, error: null };
    } catch (error: any) {
      console.error("Server SQLite insert error:", error);
      return { data: null, error };
    }
  }

  private async updateServerSQLite(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    const filteredEntries = Object.entries(data).filter(([key]) => {
      if (tableColumns.size === 0) return true;
      return tableColumns.has(key);
    });

    const sets = filteredEntries.map(([key]) => `${key} = ?`);
    const values = [...filteredEntries.map(([, value]) => value), id];
    if (sets.length === 0) {
      return { data: { id }, error: null };
    }

    const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`;

    try {
      const stmt = db.prepare(sql);
      stmt.run(...values);
      return { data: { id }, error: null };
    } catch (error: any) {
      console.error("Server SQLite update error:", error);
      return { data: null, error };
    }
  }

  private async deleteServerSQLite(
    table: string,
    id: string
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    const sql = `DELETE FROM ${table} WHERE id = ?`;

    try {
      const stmt = db.prepare(sql);
      stmt.run(id);
      return { data: { id }, error: null };
    } catch (error: any) {
      console.error("Server SQLite delete error:", error);
      return { data: null, error };
    }
  }

  // === Server-side Supabase Operations ===

  private async queryServerSupabase<T>(
    table: string,
    options: QueryOptions
  ): Promise<QueryResult<T>> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    let query = supabase.from(table).select(options.select || "*");

    // Apply filters
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        if (value === null) {
          query = query.is(key, null);
        } else {
          query = query.eq(key, value);
        }
      });
    }

    // Apply ordering
    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Server Supabase query error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as T[], error: null };
  }

  private async insertServerSupabase(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    const payload =
      tableColumns.size > 0
        ? Object.fromEntries(
            Object.entries(data).filter(([key]) => tableColumns.has(key))
          )
        : data;

    if (!(await this.registerMutationIfNeeded(table, data.id, payload))) {
      return { data: { id: data.id }, error: null };
    }

    const { data: inserted, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      console.error(`Server Supabase insert error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id: inserted.id }, error: null };
  }

  private async updateServerSupabase(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    const payload =
      tableColumns.size > 0
        ? Object.fromEntries(
            Object.entries(data).filter(([key]) => tableColumns.has(key))
          )
        : data;

    if (!(await this.registerMutationIfNeeded(table, id, payload))) {
      return { data: { id }, error: null };
    }

    const { error } = await supabase.from(table).update(payload).eq("id", id);

    if (error) {
      console.error(`Server Supabase update error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id }, error: null };
  }

  private async deleteServerSupabase(
    table: string,
    id: string
  ): Promise<MutationResult> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      console.error(`Server Supabase delete error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id }, error: null };
  }

  private async registerMutationIfNeeded(
    table: string,
    recordId: string,
    data: Record<string, any>
  ): Promise<boolean> {
    const supabase = getServerSupabaseClient();
    if (!supabase || !data.client_mutation_id) return true;

    const mutationId = data.client_mutation_id as string;
    const { data: existing } = await supabase
      .from("sync_mutation_registry")
      .select("id")
      .eq("client_mutation_id", mutationId)
      .maybeSingle();

    if (existing) return false;

    await supabase.from("sync_mutation_registry").insert({
      client_mutation_id: mutationId,
      table_name: table,
      record_id: recordId,
      device_id: data.updated_by_device || getDeviceId(),
      payload_hash: JSON.stringify(data).length.toString(),
    });
    return true;
  }

  // === Tauri SQLite Operations ===

  private async queryTauri<T>(
    table: string,
    options: QueryOptions
  ): Promise<QueryResult<T>> {
    let sql = `SELECT ${options.select || "*"} FROM ${table}`;
    const params: any[] = [];

    // Build WHERE clause
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.entries(options.where).map(([key, value]) => {
        if (value === null) {
          return `${key} IS NULL`;
        }
        params.push(value);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add ORDER BY
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy.column} ${
        options.orderBy.ascending !== false ? "ASC" : "DESC"
      }`;
    }

    // Add LIMIT and OFFSET
    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }
    if (options.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const data = await invoke<T[]>("db_query", { sql, params });
    return { data, error: null };
  }

  private async insertTauri(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");

    const sql = `INSERT INTO ${table} (${columns.join(
      ", "
    )}) VALUES (${placeholders})`;

    await invoke("db_execute", { sql, params: values });
    return { data: { id: data.id }, error: null };
  }

  private async updateTauri(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const sets = Object.keys(data).map((key) => `${key} = ?`);
    const values = [...Object.values(data), id];

    const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`;

    await invoke("db_execute", { sql, params: values });
    return { data: { id }, error: null };
  }

  private async deleteTauri(
    table: string,
    id: string
  ): Promise<MutationResult> {
    const sql = `DELETE FROM ${table} WHERE id = ?`;

    await invoke("db_execute", { sql, params: [id] });
    return { data: { id }, error: null };
  }

  // === Supabase Operations ===

  private async querySupabase<T>(
    table: string,
    options: QueryOptions
  ): Promise<QueryResult<T>> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Supabase not configured") };
    }

    let query = supabase.from(table).select(options.select || "*");

    // Apply filters
    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        if (value === null) {
          query = query.is(key, null);
        } else {
          query = query.eq(key, value);
        }
      });
    }

    // Apply ordering
    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    // Apply pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1
      );
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    // Cache data for offline use
    this.cacheData(table, data);

    return { data: data as T[], error: null };
  }

  private async insertSupabase(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Supabase not configured") };
    }

    const { data: inserted, error } = await supabase
      .from(table)
      .insert(data)
      .select("id")
      .single();

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id: inserted.id }, error: null };
  }

  private async updateSupabase(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Supabase not configured") };
    }

    const { error } = await supabase.from(table).update(data).eq("id", id);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id }, error: null };
  }

  private async deleteSupabase(
    table: string,
    id: string
  ): Promise<MutationResult> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Supabase not configured") };
    }

    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: { id }, error: null };
  }

  // === Caching for offline support ===

  private cacheData<T>(table: string, data: any) {
    if (!isBrowser() || isTauriApp()) return;

    try {
      const cacheKey = `cache_${table}`;
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.warn("Failed to cache data:", e);
    }
  }

  private getCachedData<T>(table: string): T[] | null {
    if (!isBrowser() || isTauriApp()) return null;

    try {
      const cacheKey = `cache_${table}`;
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);

      // Cache expires after 1 hour
      const CACHE_TTL = 60 * 60 * 1000;
      if (Date.now() - timestamp > CACHE_TTL) {
        localStorage.removeItem(cacheKey);
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  // === Tauri background sync ===

  private queueTauriSync(
    table: string,
    operation: "insert" | "update" | "delete",
    data: any,
    recordId?: string
  ) {
    // Queue operation for background sync to Supabase
    // This will be handled by a background task in Tauri
    if (!isTauriApp()) return;

    invoke("queue_sync_operation", {
      table,
      operation,
      data: data ? JSON.stringify(data) : null,
      recordId,
    }).catch((e) => console.warn("Failed to queue sync:", e));
  }

  // === Server-side sync queue ===

  private ensureServerSyncQueueSchema(db: any) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT,
        record_id TEXT,
        dibuat_pada TEXT NOT NULL,
        status TEXT DEFAULT 'pending'
      )
    `);

    const columns = (
      db.prepare("PRAGMA table_info(sync_queue)").all() as Array<{ name: string }>
    ).map((c) => c.name);

    if (!columns.includes("dibuat_pada")) {
      db.exec("ALTER TABLE sync_queue ADD COLUMN dibuat_pada TEXT");
      if (columns.includes("created_at")) {
        db.exec(
          "UPDATE sync_queue SET dibuat_pada = COALESCE(dibuat_pada, created_at, datetime('now'))"
        );
      } else {
        db.exec(
          "UPDATE sync_queue SET dibuat_pada = COALESCE(dibuat_pada, datetime('now'))"
        );
      }
    }

    if (!columns.includes("status")) {
      db.exec("ALTER TABLE sync_queue ADD COLUMN status TEXT DEFAULT 'pending'");
      if (columns.includes("synced_at")) {
        db.exec(
          "UPDATE sync_queue SET status = CASE WHEN synced_at IS NULL THEN 'pending' ELSE 'completed' END WHERE status IS NULL"
        );
      } else {
        db.exec("UPDATE sync_queue SET status = COALESCE(status, 'pending')");
      }
    }
  }

  private async queueToLocalSync(
    table: string,
    operation: "insert" | "update" | "delete",
    data: any,
    recordId?: string
  ) {
    // Queue operation for later sync to Supabase when connection is restored
    if (!isServerSide()) return;

    const db = await getServerSQLite();
    if (!db) return;

    try {
      this.ensureServerSyncQueueSchema(db);

      // Insert sync operation
      const queueId = generateId();
      const now = getCurrentTimestamp();
      const stmt = db.prepare(`
        INSERT INTO sync_queue (id, table_name, operation, data, record_id, dibuat_pada, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `);
      stmt.run(
        queueId,
        table,
        operation,
        data ? JSON.stringify(data) : null,
        recordId || null,
        now
      );
      console.log(`📝 Queued ${operation} on ${table} for later sync`);
    } catch (error: any) {
      console.error("Failed to queue sync operation:", error);
    }
  }

  /**
   * Process pending sync queue (call this when connection is restored)
   */
  async processSyncQueue() {
    if (!isServerSide()) {
      console.warn("processSyncQueue only available on server-side");
      return;
    }

    const supabaseAvailable = await isServerSupabaseAvailable();
    if (!supabaseAvailable) {
      console.log("🔴 Supabase not available, skipping sync queue processing");
      return;
    }

    const db = await getServerSQLite();
    if (!db) return;

    try {
      this.ensureServerSyncQueueSchema(db);

      // Get pending operations
      const stmt = db.prepare(`
        SELECT * FROM sync_queue 
        WHERE status = 'pending' 
        ORDER BY dibuat_pada ASC
      `);
      const pendingOps = stmt.all() as any[];

      console.log(
        `🔄 Processing ${pendingOps.length} pending sync operations...`
      );

      for (const op of pendingOps) {
        try {
          const data = op.data ? JSON.parse(op.data) : null;

          // Execute operation on Supabase
          let result;
          if (op.operation === "insert") {
            result = await this.insertServerSupabase(op.table_name, data);
          } else if (op.operation === "update") {
            result = await this.updateServerSupabase(
              op.table_name,
              op.record_id,
              data
            );
          } else if (op.operation === "delete") {
            result = await this.deleteServerSupabase(
              op.table_name,
              op.record_id
            );
          }

          if (result && !result.error) {
            // Mark as completed
            const updateStmt = db.prepare(`
              UPDATE sync_queue SET status = 'completed' WHERE id = ?
            `);
            updateStmt.run(op.id);
            console.log(`✅ Synced ${op.operation} on ${op.table_name}`);
          } else {
            console.error(
              `❌ Failed to sync ${op.operation} on ${op.table_name}:`,
              result?.error
            );
          }
        } catch (error: any) {
          console.error(`❌ Error processing sync operation ${op.id}:`, error);
        }
      }

      // Clean up completed operations older than 7 days
      const cleanupStmt = db.prepare(`
        DELETE FROM sync_queue 
        WHERE status = 'completed' 
        AND datetime(dibuat_pada) < datetime('now', '-7 days')
      `);
      const cleaned = cleanupStmt.run();
      if (cleaned.changes > 0) {
        console.log(`🧹 Cleaned up ${cleaned.changes} old sync queue entries`);
      }
    } catch (error: any) {
      console.error("Error processing sync queue:", error);
    }
  }

  /**
   * Execute raw SQL (use with caution)
   * For complex operations that cannot be done with the query builder
   */
  async executeRaw(sql: string, params: any[] = []): Promise<any> {
    // Tauri: Use Rust backend
    if (isTauriApp()) {
      try {
        return await invoke("db_execute", { sql, params });
      } catch (error) {
        console.error("Raw SQL execution failed:", error);
        throw error;
      }
    }

    // Server-side: Use SQLite directly
    if (isServerSide()) {
      const db = await getServerSQLite();
      if (!db) {
        throw new Error("Server SQLite not available");
      }

      try {
        const stmt = db.prepare(sql);
        const result = stmt.run(...params);
        return result;
      } catch (error: any) {
        console.error("Server SQLite raw execution error:", error);
        throw error;
      }
    }

    // Browser: Not supported
    throw new Error("Raw SQL execution not available in browser mode");
  }

  /**
   * Transitional helper for legacy routes that still require native sqlite APIs.
   * New code should prefer query/insert/update/delete methods on this adapter.
   */
  async getNativeSQLite(): Promise<any> {
    if (!isServerSide()) {
      throw new Error("Native SQLite access is server-side only");
    }
    return await getServerSQLite();
  }

  /**
   * Execute operations in transaction
   * Browser mode: No transaction support, operations execute sequentially
   */
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    // Tauri or Server-side: Use transactions
    if (isTauriApp() || isServerSide()) {
      try {
        await this.executeRaw("BEGIN TRANSACTION");
        const result = await operations();
        await this.executeRaw("COMMIT");
        return result;
      } catch (error) {
        await this.executeRaw("ROLLBACK");
        console.error("Transaction rolled back:", error);
        throw error;
      }
    }

    // Browser: No transaction support, just execute
    console.warn(
      "Transactions not supported in browser mode - executing sequentially"
    );
    return await operations();
  }

  /**
   * Query raw SQL (use with caution)
   */
  async queryRaw<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    // Tauri: Use Rust backend
    if (isTauriApp()) {
      try {
        return await invoke<T[]>("db_query", { sql, params });
      } catch (error) {
        console.error("Raw SQL query failed:", error);
        throw error;
      }
    }

    // Server-side: Use SQLite directly
    if (isServerSide()) {
      const db = await getServerSQLite();
      if (!db) {
        throw new Error("Server SQLite not available");
      }

      try {
        const stmt = db.prepare(sql);
        const data = stmt.all(...params) as T[];
        return data;
      } catch (error: any) {
        console.error("Server SQLite raw query error:", error);
        throw error;
      }
    }

    // Browser: Not supported
    throw new Error("Raw SQL query not available in browser mode");
  }

  /**
   * Batch insert (optimized for multiple records)
   */
  async batchInsert(
    table: string,
    records: Record<string, any>[]
  ): Promise<MutationResult[]> {
    const results: MutationResult[] = [];

    for (const record of records) {
      const result = await this.insert(table, record);
      results.push(result);
    }

    return results;
  }

  /**
   * Get pending sync count (Tauri only)
   */
  async getPendingSyncCount(): Promise<number> {
    if (!isTauriApp()) {
      return getPendingQueueCount();
    }

    try {
      const count = await invoke<number>("count_pending_sync");
      return count;
    } catch (error) {
      console.error("Failed to get pending sync count:", error);
      return 0;
    }
  }

  /**
   * Manually trigger sync from SQLite to Supabase (Tauri only)
   */
  async syncToCloud(): Promise<{
    success: boolean;
    synced: number;
    failed: number;
  }> {
    if (isServerSide()) {
      try {
        await this.processSyncQueue();
        return { success: true, synced: 0, failed: 0 };
      } catch (error) {
        console.error("Server-mediated sync failed:", error);
        return { success: false, synced: 0, failed: 1 };
      }
    }

    if (!isTauriApp()) {
      return { success: false, synced: 0, failed: 1 };
    }

    try {
      const result = await invoke<{ synced: number; failed: number }>(
        "sync_to_cloud"
      );
      return {
        success: result.failed === 0,
        synced: result.synced,
        failed: result.failed,
      };
    } catch (error) {
      console.error("Sync failed:", error);
      return { success: false, synced: 0, failed: 0 };
    }
  }

  /**
   * Pull latest cloud changes into local SQLite (Tauri only)
   */
  async syncFromCloud(): Promise<{
    success: boolean;
    pulled: number;
    failed: number;
  }> {
    if (isServerSide()) {
      const supabase = getServerSupabaseClient();
      const sqlite = await getServerSQLite();
      if (!supabase || !sqlite) {
        return { success: false, pulled: 0, failed: 1 };
      }

      let pulled = 0;
      let failed = 0;
      const deferredForeignKeyRows: Array<{
        table: string;
        entries: Array<[string, any]>;
        shouldCountAsChange: boolean;
      }> = [];

      for (const table of SYNC_V2_TABLES) {
        try {
          const { data, error } = await supabase.from(table).select("*");
          if (error) {
            const code = (error as any)?.code;
            const message = String((error as any)?.message || "");
            const isSchemaDrift =
              code === "PGRST204" ||
              code === "PGRST205" ||
              code === "42P01" ||
              message.includes("schema cache") ||
              message.includes("Could not find the table") ||
              message.includes("Could not find the");

            // Non-fatal: skip tables that are not present yet in cloud schema.
            if (isSchemaDrift) {
              console.warn(
                `⚠️ syncFromCloud skipped table ${table} due to schema drift:`,
                code || message
              );
              continue;
            }

            console.error(`❌ syncFromCloud failed on table ${table}:`, error);
            failed++;
            continue;
          }
          if (!data || data.length === 0) continue;

          const columns = await getServerSQLiteTableColumns(table);
          for (const row of data) {
            const normalized = normalizeRecord(
              row as Record<string, any>,
              "fromSupabase"
            );
            const recordId =
              typeof normalized.id === "string" ? normalized.id : null;
            let shouldCountAsChange = true;
            if (recordId && columns.has("id")) {
              const existing = sqlite
                .prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`)
                .get(recordId) as Record<string, any> | undefined;
              if (existing) {
                const remoteUpdatedAt =
                  normalized.updated_at_server ?? normalized.diperbarui_pada ?? null;
                const localUpdatedAt =
                  existing.updated_at_server ?? existing.diperbarui_pada ?? null;
                shouldCountAsChange = String(remoteUpdatedAt) !== String(localUpdatedAt);
              }
            }
            const entries = Object.entries(normalized).filter(([key]) =>
              columns.has(key)
            );
            if (entries.length === 0) continue;
            const names = entries.map(([key]) => key);
            const values = entries.map(([, value]) => value);
            const placeholders = names.map(() => "?").join(", ");
            const upsertAssignments = names
              .filter((name) => name !== "id")
              .map((name) => `${name}=excluded.${name}`)
              .join(", ");
            const upsertSql =
              upsertAssignments.length > 0
                ? `INSERT INTO ${table} (${names.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${upsertAssignments}`
                : `INSERT OR IGNORE INTO ${table} (${names.join(", ")}) VALUES (${placeholders})`;
            try {
              sqlite
                .prepare(upsertSql)
                .run(...values);
              if (shouldCountAsChange) {
                pulled++;
              }
            } catch (rowError: any) {
              const isForeignKeyError =
                rowError?.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
                String(rowError?.message || "").includes("FOREIGN KEY");
              if (isForeignKeyError) {
                // Retry after full pass; parent records may be synced in later tables.
                deferredForeignKeyRows.push({
                  table,
                  entries,
                  shouldCountAsChange,
                });
                continue;
              }

              // satuan_barang has a UNIQUE constraint on `nama` in addition to
              // the primary key. If the local DB already has a row with the same
              // `nama` but a different `id` (e.g. user created "m²" manually via
              // Settings before the cloud seed ran), the INSERT … ON CONFLICT(id)
              // will hit the UNIQUE(nama) constraint. Handle it by updating the
              // existing row's id to match the cloud record so future syncs work.
              const isUniqueError =
                rowError?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
                String(rowError?.message || "").includes("UNIQUE constraint");
              if (isUniqueError && table === "satuan_barang") {
                try {
                  const namaEntry = entries.find(([k]) => k === "nama");
                  const idEntry = entries.find(([k]) => k === "id");
                  if (namaEntry && idEntry) {
                    const namaVal = namaEntry[1];
                    const newId = idEntry[1];
                    // Re-point the existing row to the cloud id, then upsert.
                    sqlite
                      .prepare(`UPDATE satuan_barang SET id = ? WHERE nama = ? AND id != ?`)
                      .run(newId, namaVal, newId);
                    sqlite.prepare(upsertSql).run(...values);
                    if (shouldCountAsChange) pulled++;
                  }
                } catch (retryErr) {
                  console.warn(`⚠ satuan_barang UNIQUE retry failed for row:`, retryErr);
                }
                continue;
              }

              throw rowError;
            }
          }
        } catch (error) {
          console.error(`❌ syncFromCloud exception on table ${table}:`, error);
          failed++;
        }
      }

      // Retry rows that previously failed due to FK ordering.
      if (deferredForeignKeyRows.length > 0) {
        for (const deferred of deferredForeignKeyRows) {
          try {
            let entries = [...deferred.entries];

            // Self-heal FK drift for barang: if referenced category/subcategory
            // does not exist locally, set FK columns to NULL (schema uses ON DELETE SET NULL).
            if (deferred.table === "barang") {
              const entryMap = new Map(entries);
              const kategoriId = entryMap.get("kategori_id");
              const subkategoriId = entryMap.get("subkategori_id");

              if (kategoriId) {
                const existsKategori = sqlite
                  .prepare("SELECT 1 FROM kategori_barang WHERE id = ? LIMIT 1")
                  .get(kategoriId);
                if (!existsKategori) {
                  entryMap.set("kategori_id", null);
                }
              }

              if (subkategoriId) {
                const existsSubkategori = sqlite
                  .prepare("SELECT 1 FROM subkategori_barang WHERE id = ? LIMIT 1")
                  .get(subkategoriId);
                if (!existsSubkategori) {
                  entryMap.set("subkategori_id", null);
                }
              }

              entries = Array.from(entryMap.entries());
            }

            const names = entries.map(([key]) => key);
            const values = entries.map(([, value]) => value);
            const placeholders = names.map(() => "?").join(", ");
            const upsertAssignments = names
              .filter((name) => name !== "id")
              .map((name) => `${name}=excluded.${name}`)
              .join(", ");
            const upsertSql =
              upsertAssignments.length > 0
                ? `INSERT INTO ${deferred.table} (${names.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${upsertAssignments}`
                : `INSERT OR IGNORE INTO ${deferred.table} (${names.join(", ")}) VALUES (${placeholders})`;
            sqlite
              .prepare(upsertSql)
              .run(...values);
            if (deferred.shouldCountAsChange) {
              pulled++;
            }
          } catch (retryError: any) {
            console.warn(
              `⚠️ syncFromCloud FK retry failed on table ${deferred.table}:`,
              retryError?.code || retryError?.message || retryError
            );
            failed++;
          }
        }
      }

      return {
        success: failed === 0,
        pulled,
        failed,
      };
    }

    if (!isTauriApp()) {
      return { success: false, pulled: 0, failed: 1 };
    }

    try {
      const result = await invoke<{ pulled: number; failed: number }>(
        "sync_from_cloud"
      );
      return {
        success: result.failed === 0,
        pulled: result.pulled,
        failed: result.failed,
      };
    } catch (error) {
      console.error("Pull from cloud failed:", error);
      return { success: false, pulled: 0, failed: 0 };
    }
  }

  /**
   * Process offline queue (Web only)
   */
  async processOfflineQueue(): Promise<{
    success: boolean;
    processed: number;
    failed: number;
  }> {
    if (isTauriApp()) {
      return { success: true, processed: 0, failed: 0 };
    }

    const queue = getOfflineQueue();
    if (queue.length === 0) {
      return { success: true, processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;

    for (const op of queue) {
      try {
        switch (op.operation) {
          case "insert":
            await this.insertSupabase(op.table, op.data);
            break;
          case "update":
            if (op.recordId) {
              await this.updateSupabase(op.table, op.recordId, op.data);
            }
            break;
          case "delete":
            if (op.recordId) {
              await this.deleteSupabase(op.table, op.recordId);
            }
            break;
        }
        processed++;
      } catch (error) {
        console.error(`Failed to process queued operation:`, error);
        failed++;
      }
    }

    // Clear processed items from queue
    if (processed > 0) {
      const remainingQueue = queue.slice(processed);
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    }

    return {
      success: failed === 0,
      processed,
      failed,
    };
  }
}

// ============================================================================
// COMPOSITE OPERATIONS (Business Logic)
// ============================================================================

/**
 * Create material with unit prices (atomic operation)
 */
export async function createMaterialWithUnitPrices(materialData: {
  nama: string;
  deskripsi?: string;
  kategori_id?: string;
  subkategori_id?: string;
  satuan_dasar: string;
  spesifikasi?: string;
  jumlah_stok?: number;
  level_stok_minimum?: number;
  lacak_inventori_status?: boolean;
  butuh_dimensi_status?: boolean;
  unit_prices: Array<{
    nama_satuan: string;
    faktor_konversi: number;
    harga_beli?: number;
    harga_jual?: number;
    harga_member?: number;
    default_status?: boolean;
  }>;
}): Promise<MutationResult> {
  try {
    // Validate
    if (!materialData.nama?.trim()) {
      return { data: null, error: new Error("Nama barang harus diisi") };
    }
    if (!materialData.satuan_dasar?.trim()) {
      return { data: null, error: new Error("Satuan dasar harus diisi") };
    }
    if (!materialData.unit_prices || materialData.unit_prices.length === 0) {
      return {
        data: null,
        error: new Error("Minimal harus ada 1 harga satuan"),
      };
    }

    // Check if material already exists
    const existing = await db.queryOne("barang", {
      where: { nama: materialData.nama.trim() },
    });

    if (existing.data) {
      return {
        data: null,
        error: new Error("Barang dengan nama ini sudah ada"),
      };
    }

    // Generate ID
    const materialId = `mat-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Execute in transaction (Tauri only, Web executes sequentially)
    return await db.transaction(async () => {
      const defaultUnitPrice =
        materialData.unit_prices.find((up) => up.default_status) ??
        materialData.unit_prices.find((up) => Number(up.faktor_konversi) === 1) ??
        materialData.unit_prices[0];
      const averageCostPerBaseUnit =
        defaultUnitPrice && Number(defaultUnitPrice.faktor_konversi || 0) > 0
          ? Number(defaultUnitPrice.harga_beli || 0) /
            Number(defaultUnitPrice.faktor_konversi || 1)
          : 0;
      // Prepare material data
      const material = {
        id: materialId,
        nama: materialData.nama.trim(),
        deskripsi: materialData.deskripsi?.trim() || null,
        kategori_id: materialData.kategori_id || null,
        subkategori_id: materialData.subkategori_id || null,
        satuan_dasar: materialData.satuan_dasar.trim(),
        spesifikasi: materialData.spesifikasi?.trim() || null,
        jumlah_stok: materialData.jumlah_stok || 0,
        level_stok_minimum: materialData.level_stok_minimum || 0,
        lacak_inventori_status:
          materialData.lacak_inventori_status !== false ? 1 : 0,
        butuh_dimensi_status: materialData.butuh_dimensi_status ? 1 : 0,
        average_cost_per_base_unit: averageCostPerBaseUnit,
      };

      // Insert material
      const materialResult = await db.insert("barang", material);
      if (materialResult.error) {
        throw materialResult.error;
      }

      // Insert unit prices
      for (let i = 0; i < materialData.unit_prices.length; i++) {
        const up = materialData.unit_prices[i];
        const unitPriceId = `up-${Date.now()}-${i}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        const unitPrice = {
          id: unitPriceId,
          barang_id: materialId,
          nama_satuan: up.nama_satuan,
          faktor_konversi: up.faktor_konversi,
          harga_beli: up.harga_beli || 0,
          harga_jual: up.harga_jual || 0,
          harga_member: up.harga_member || 0,
          default_status: up.default_status ? 1 : 0,
          urutan_tampilan: i,
        };

        const upResult = await db.insert("harga_barang_satuan", unitPrice);
        if (upResult.error) {
          throw upResult.error;
        }
      }

      return { data: { id: materialId }, error: null };
    });
  } catch (error: any) {
    console.error("Error creating material with unit prices:", error);
    return { data: null, error };
  }
}

/**
 * Get material with unit prices
 */
export async function getMaterialWithUnitPrices(materialId: string) {
  try {
    const materialResult = await db.queryOne("barang", {
      where: { id: materialId },
    });

    if (materialResult.error || !materialResult.data) {
      return materialResult;
    }

    const unitPricesResult = await db.query("harga_barang_satuan", {
      where: { barang_id: materialId },
      orderBy: { column: "urutan_tampilan", ascending: true },
    });

    return {
      data: {
        ...materialResult.data,
        unit_prices: unitPricesResult.data || [],
      },
      error: null,
    };
  } catch (error: any) {
    return { data: null, error };
  }
}

/**
 * Get all materials with unit prices
 */
export async function getAllMaterialsWithUnitPrices() {
  try {
    const materialsResult = await db.query("barang", {
      orderBy: { column: "nama", ascending: true },
    });

    if (materialsResult.error || !materialsResult.data) {
      return materialsResult;
    }

    const materialsWithUnits = await Promise.all(
      materialsResult.data.map(async (material: any) => {
        const unitPricesResult = await db.query("harga_barang_satuan", {
          where: { barang_id: material.id },
          orderBy: { column: "urutan_tampilan", ascending: true },
        });

        return {
          ...material,
          unit_prices: unitPricesResult.data || [],
        };
      })
    );

    return { data: materialsWithUnits, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
}

/**
 * Execute a function that requires direct SQLite database access (Tauri only)
 * This helper creates and manages the Database instance lifecycle
 *
 * @param callback Function that receives the Database instance
 * @returns Result from the callback
 */
export async function withSQLiteDatabase<T>(
  callback: (db: any) => Promise<T> | T
): Promise<T> {
  if (!isTauriApp()) {
    throw new Error("SQLite direct access is only available in Tauri app");
  }

  const Database = (await import("better-sqlite3")).default;
  const path = await import("path");
  const dbPath = path.join(process.cwd(), "database", "gemiprint.db");
  const dbInstance = new Database(dbPath);

  try {
    return await callback(dbInstance);
  } finally {
    dbInstance.close();
  }
}

// Export singleton instance
export const db = new UnifiedDatabase();

// Auto-process offline queue when coming back online (Web only)
if (isBrowser() && !isTauriApp()) {
  window.addEventListener("online", async () => {
    console.log("📡 Back online - processing offline queue...");
    const result = await db.processOfflineQueue();
    console.log(
      `Processed ${result.processed} operations, ${result.failed} failed`
    );
  });
}
