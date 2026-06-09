/**
 * SQLite runtime migrations — ALTER TABLE statements yang dijalankan saat startup.
 * Diekstrak dari db-sqlite.ts.
 *
 * JANGAN import dari db-unified.ts — akan circular.
 */

import "server-only";

import {
  migratePeranPegawaiLegacyCheckConstraint,
  migrateInventoryMovementsCheckConstraint,
  ensureCommercialWorkflowTables,
} from "./db-sqlite-schema";
import { SYNC_V2_TABLES, serverSqliteColumnsCache } from "./db-sqlite";

/**
 * Authoritative English → Indonesian table rename map for the runtime SQLite
 * runner. Each pair carries the dependent indexes whose names embed the old
 * table name so they can be dropped and recreated under the Indonesian names.
 * Ordered so `peran_pegawai` precedes `pegawai` (FK-safe).
 */
const ENGLISH_TO_INDONESIAN_TABLE_RENAMES: ReadonlyArray<{
  oldTable: string;
  newTable: string;
  indexes: ReadonlyArray<{ oldName: string; newName: string; column: string }>;
}> = [
  {
    oldTable: "actor_roles",
    newTable: "peran_pegawai",
    indexes: [
      { oldName: "idx_actor_roles_group", newName: "idx_peran_pegawai_group", column: "role_group" },
      { oldName: "idx_actor_roles_order", newName: "idx_peran_pegawai_order", column: "display_order" },
    ],
  },
  {
    oldTable: "business_actors",
    newTable: "pegawai",
    indexes: [
      { oldName: "idx_business_actors_role", newName: "idx_pegawai_role", column: "role_code" },
      { oldName: "idx_business_actors_active", newName: "idx_pegawai_active", column: "is_active" },
      { oldName: "idx_business_actors_order", newName: "idx_pegawai_order", column: "display_order" },
    ],
  },
  {
    oldTable: "transaction_computed",
    newTable: "transaksi_terhitung",
    indexes: [
      { oldName: "idx_tc_formula_key", newName: "idx_transaksi_terhitung_formula_key", column: "formula_key" },
      { oldName: "idx_tc_transaction", newName: "idx_transaksi_terhitung_transaction", column: "transaction_id" },
    ],
  },
  {
    oldTable: "transaction_overrides",
    newTable: "transaksi_penggantian",
    indexes: [
      { oldName: "idx_to_formula_key", newName: "idx_transaksi_penggantian_formula_key", column: "formula_key" },
    ],
  },
  {
    oldTable: "cashbook_formula",
    newTable: "rumus_buku_kas",
    indexes: [
      { oldName: "idx_cashbook_formula_order", newName: "idx_rumus_buku_kas_order", column: "display_order" },
      { oldName: "idx_cashbook_formula_key", newName: "idx_rumus_buku_kas_key", column: "formula_key" },
      { oldName: "idx_cashbook_formula_actor", newName: "idx_rumus_buku_kas_actor", column: "actor_id" },
      { oldName: "idx_cashbook_formula_group", newName: "idx_rumus_buku_kas_group", column: "formula_group" },
    ],
  },
];

/**
 * Renames the legacy English-named tables to their Indonesian equivalents on
 * existing local installs, preserving all rows. Per pair this:
 *   - skips when the Indonesian table already exists (already migrated),
 *   - skips when the English table is absent (fresh install from new schema),
 *   - otherwise renames inside a transaction with `foreign_keys = OFF`, drops
 *     the old-named dependent indexes, and recreates them under the Indonesian
 *     names, rolling back on any error.
 * Must run BEFORE the bootstrap CREATE TABLE statements so they operate on the
 * renamed tables.
 */
export function migrateEnglishTablesToIndonesian(db: {
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown;
    all: () => unknown[];
  };
  pragma: (s: string) => void;
  exec: (sql: string) => void;
}): void {
  const tableExists = (name: string): boolean =>
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1"
      )
      .get(name) !== undefined;

  for (const { oldTable, newTable, indexes } of ENGLISH_TO_INDONESIAN_TABLE_RENAMES) {
    // Already migrated — the Indonesian-named table exists (Req 5.2).
    if (tableExists(newTable)) continue;
    // Fresh install from the updated schema — nothing to rename (Req 5.5).
    if (!tableExists(oldTable)) continue;

    db.pragma("foreign_keys = OFF");
    db.exec("BEGIN TRANSACTION;");
    try {
      // RENAME preserves all existing rows (Req 5.1, 8.1, 8.2).
      db.exec(`ALTER TABLE ${oldTable} RENAME TO ${newTable};`);

      // SQLite keeps dependent indexes pointing at the renamed table but under
      // their old names; drop them and recreate under the Indonesian names
      // (Req 5.3). Only recreate indexes whose target column exists, since the
      // additive cashbook_formula columns are backfilled later in bootstrap.
      const cols = new Set(
        (
          db.prepare(`PRAGMA table_info(${newTable})`).all() as Array<{
            name: string;
          }>
        ).map((c) => c.name)
      );
      for (const { oldName, newName, column } of indexes) {
        db.exec(`DROP INDEX IF EXISTS ${oldName};`);
        if (cols.has(column)) {
          db.exec(
            `CREATE INDEX IF NOT EXISTS ${newName} ON ${newTable}(${column});`
          );
        }
      }
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.pragma("foreign_keys = ON");
    }
    console.info(`✅ Renamed SQLite table ${oldTable} → ${newTable}`);
  }
}

export function migrateCashbookFormulaDbColumnNullable(db: {
  prepare: (sql: string) => {
    get: () => { sql?: string } | undefined;
    all: () => unknown[];
  };
  pragma: (s: string) => void;
  exec: (sql: string) => void;
}): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'rumus_buku_kas'"
    )
    .get();
  // Detect the legacy NOT NULL constraint. Match both `db_column TEXT NOT NULL`
  // and any whitespace variations that better-sqlite3 might emit.
  if (!row?.sql || !/db_column\s+TEXT\s+NOT\s+NULL/i.test(row.sql)) return;

  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE rumus_buku_kas_v2 (
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
  `);

  // Copy preserving any extra columns that may have been added by earlier
  // additive migrations (formula_key, actor_id, formula_group, is_visible_in_summary).
  const cols = (
    db.prepare("PRAGMA table_info(rumus_buku_kas)").all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  const extraCols = [
    "formula_key",
    "actor_id",
    "formula_group",
    "is_visible_in_summary",
  ].filter((c) => cols.includes(c));

  // Add the extra columns to v2 first.
  for (const col of extraCols) {
    if (col === "formula_group") {
      db.exec(
        `ALTER TABLE rumus_buku_kas_v2 ADD COLUMN formula_group TEXT NOT NULL DEFAULT 'custom'`
      );
    } else if (col === "is_visible_in_summary") {
      db.exec(
        `ALTER TABLE rumus_buku_kas_v2 ADD COLUMN is_visible_in_summary INTEGER NOT NULL DEFAULT 0`
      );
    } else {
      db.exec(`ALTER TABLE rumus_buku_kas_v2 ADD COLUMN ${col} TEXT`);
    }
  }

  const baseColList = [
    "id",
    "name",
    "column_key",
    "db_column",
    "ast",
    "enabled",
    "is_system",
    "display_order",
    "description",
    "created_at",
    "updated_at",
    ...extraCols,
  ].join(", ");

  db.exec(`
    INSERT INTO rumus_buku_kas_v2 (${baseColList})
    SELECT ${baseColList} FROM rumus_buku_kas;

    DROP TABLE rumus_buku_kas;
    ALTER TABLE rumus_buku_kas_v2 RENAME TO rumus_buku_kas;
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_order ON rumus_buku_kas(display_order);`
  );
  if (extraCols.includes("formula_key")) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_key ON rumus_buku_kas(formula_key);`
    );
  }
  if (extraCols.includes("actor_id")) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_actor ON rumus_buku_kas(actor_id);`
    );
  }
  if (extraCols.includes("formula_group")) {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_group ON rumus_buku_kas(formula_group);`
    );
  }
  db.pragma("foreign_keys = ON");
  console.info("✅ Migrated rumus_buku_kas: db_column is now nullable");
}

export function ensureServerSQLiteSyncV2Schema(db: any) {
  // Rename legacy English-named tables to Indonesian BEFORE any bootstrap
  // CREATE/ALTER runs, so all subsequent statements operate on the renamed
  // tables (Req 5.1–5.3, 5.5).
  migrateEnglishTablesToIndonesian(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_category_definitions (
      id TEXT PRIMARY KEY,
      category_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      color_bg TEXT NOT NULL DEFAULT 'bg-gray-100 dark:bg-slate-800',
      color_text TEXT NOT NULL DEFAULT 'text-gray-800 dark:text-slate-100',
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
      sync_version INTEGER DEFAULT 1
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
    -- db_column is nullable: formulas like modal_kas/piutang_kas/kas have no
    -- corresponding column in keuangan and only write to transaksi_terhitung.
    CREATE TABLE IF NOT EXISTS rumus_buku_kas (
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

    CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_order
      ON rumus_buku_kas(display_order);

    -- ── pegawai v2 (generic, name-free architecture) ─────────────────────
    -- See supabase/migrations/20260521090000_business_actors_v2.sql
    -- role_group is a display category for organising job titles in the UI.
    -- It does NOT restrict formula types — any actor can have profit share,
    -- kasbon, and bonus simultaneously regardless of their role.
    CREATE TABLE IF NOT EXISTS peran_pegawai (
      id            TEXT PRIMARY KEY,
      role_code     TEXT NOT NULL UNIQUE,
      role_label    TEXT NOT NULL,
      role_group    TEXT NOT NULL DEFAULT 'other',
      description   TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_peran_pegawai_group ON peran_pegawai(role_group);
    CREATE INDEX IF NOT EXISTS idx_peran_pegawai_order ON peran_pegawai(display_order);

    CREATE TABLE IF NOT EXISTS pegawai (
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

    CREATE INDEX IF NOT EXISTS idx_pegawai_role   ON pegawai(role_code);
    CREATE INDEX IF NOT EXISTS idx_pegawai_active ON pegawai(is_active);
    CREATE INDEX IF NOT EXISTS idx_pegawai_order  ON pegawai(display_order);

    CREATE TABLE IF NOT EXISTS transaksi_terhitung (
      transaction_id TEXT NOT NULL,
      formula_key    TEXT NOT NULL,
      value          REAL NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (transaction_id, formula_key),
      FOREIGN KEY (transaction_id) REFERENCES keuangan(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transaksi_terhitung_formula_key ON transaksi_terhitung(formula_key);
    CREATE INDEX IF NOT EXISTS idx_transaksi_terhitung_transaction ON transaksi_terhitung(transaction_id);

    CREATE TABLE IF NOT EXISTS transaksi_penggantian (
      transaction_id  TEXT NOT NULL,
      formula_key     TEXT NOT NULL,
      override_value  REAL NOT NULL,
      overridden_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (transaction_id, formula_key),
      FOREIGN KEY (transaction_id) REFERENCES keuangan(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transaksi_penggantian_formula_key ON transaksi_penggantian(formula_key);
  `);

  // Recreate peran_pegawai when an older CHECK constraint blocks new group values.
  migratePeranPegawaiLegacyCheckConstraint(db);

  // Recreate rumus_buku_kas when older db_column NOT NULL constraint blocks
  // formulas like modal_kas/piutang_kas/kas that have no keuangan column.
  migrateCashbookFormulaDbColumnNullable(db);

  // Ensure the FK target exists before inventory_movements may be rebuilt.
  db.exec(`
    CREATE TABLE IF NOT EXISTS barang_roll_variants (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      lebar_m REAL NOT NULL,
      panjang_tersedia_m REAL NOT NULL DEFAULT 0,
      average_cost_per_m2 REAL NOT NULL DEFAULT 0,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
      CONSTRAINT barang_roll_variants_width_positive CHECK(lebar_m > 0),
      CONSTRAINT barang_roll_variants_length_nonnegative CHECK(panjang_tersedia_m >= 0),
      CONSTRAINT barang_roll_variants_unique_width UNIQUE(barang_id, lebar_m)
    );
    CREATE INDEX IF NOT EXISTS idx_barang_roll_variants_barang
      ON barang_roll_variants(barang_id, aktif_status, lebar_m);
  `);

  // Recreate inventory_movements when its CHECK constraint predates roll movements.
  migrateInventoryMovementsCheckConstraint(db);

  // Top-up commercial workflow tables (penawaran/PO/retur/opname) for older installs.
  ensureCommercialWorkflowTables(db);

  // Upsert seed roles so existing installs get updated role_group values.
  // role_group is a display-only category; it does not restrict formula types.
  db.exec(`
    INSERT INTO peran_pegawai
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

  // ── Backfill new columns on rumus_buku_kas (mirror Supabase migration) ─
  // Adds formula_key / actor_id / formula_group additively so the legacy
  // letter-keyed system keeps working while the new semantic system rolls in.
  const cashbookFormulaCols = (
    db.prepare("PRAGMA table_info(rumus_buku_kas)").all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);

  if (cashbookFormulaCols.length > 0) {
    if (!cashbookFormulaCols.includes("formula_key")) {
      db.exec(`ALTER TABLE rumus_buku_kas ADD COLUMN formula_key TEXT`);
      db.exec(`UPDATE rumus_buku_kas SET formula_key = db_column WHERE formula_key IS NULL`);
    }
    if (!cashbookFormulaCols.includes("actor_id")) {
      db.exec(`ALTER TABLE rumus_buku_kas ADD COLUMN actor_id TEXT`);
    }
    if (!cashbookFormulaCols.includes("formula_group")) {
      db.exec(
        `ALTER TABLE rumus_buku_kas ADD COLUMN formula_group TEXT NOT NULL DEFAULT 'custom'`
      );
      db.exec(`UPDATE rumus_buku_kas
                 SET formula_group = 'summary'
                 WHERE db_column IN ('omzet', 'biaya_operasional', 'biaya_bahan', 'saldo', 'laba_bersih')
                   AND formula_group = 'custom'`);
      db.exec(`UPDATE rumus_buku_kas
                 SET formula_group = 'profit_share'
                 WHERE db_column LIKE 'bagi_hasil_%'
                   AND formula_group = 'custom'`);
      db.exec(`UPDATE rumus_buku_kas
                 SET formula_group = 'cash_advance'
                 WHERE db_column LIKE 'kasbon_%'
                   AND formula_group = 'custom'`);
    }
    if (!cashbookFormulaCols.includes("is_visible_in_summary")) {
      db.exec(
        `ALTER TABLE rumus_buku_kas ADD COLUMN is_visible_in_summary INTEGER NOT NULL DEFAULT 0`
      );
      // Mirror the Supabase default: actor-driven groups visible, others hidden.
      db.exec(`UPDATE rumus_buku_kas
                 SET is_visible_in_summary = 1
                 WHERE formula_group IN ('profit_share', 'cash_advance', 'bonus')`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_key   ON rumus_buku_kas(formula_key);
             CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_actor ON rumus_buku_kas(actor_id);
             CREATE INDEX IF NOT EXISTS idx_rumus_buku_kas_group ON rumus_buku_kas(formula_group);`);

    // Per-person formulas without a linked actor are legacy seed data —
    // hard-delete them so they don't clutter the Kolom and Rumus tabs.
    // System formulas (formula_group = 'summary') are preserved.
    db.exec(`
      DELETE FROM rumus_buku_kas
      WHERE actor_id IS NULL
        AND COALESCE(is_system, 0) = 0
        AND formula_group IN ('profit_share', 'cash_advance', 'bonus')
    `);

    // Hardcoded "PRIBADI-A" / "PRIBADI-S" categories were seeded for the
    // original kasbon split. Remove them from new installs and existing
    // databases — users can recreate categories with their own names via
    // tab Kategori.
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
        ('rule-laba','laba_bersih','Laba Bersih','formula','omzet - biaya_operasional - biaya_bahan',NULL,0,50);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE','SALE_VOID','SALE_RETURN','PURCHASE_VOID','PURCHASE_RETURN','ADJUSTMENT','WASTE','ROLL_CONVERSION_OUT','ROLL_CONVERSION_IN','PRODUCTION_ISSUE','PRODUCTION_WASTE')),
      qty_delta REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      value_delta REAL NOT NULL DEFAULT 0,
      qty_before REAL NOT NULL DEFAULT 0,
      qty_after REAL NOT NULL DEFAULT 0,
      avg_cost_before REAL NOT NULL DEFAULT 0,
      avg_cost_after REAL NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_line_id TEXT,
      reversal_of_id TEXT,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      roll_variant_id TEXT,
      roll_width_m REAL,
      linear_delta_m REAL,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id) ON DELETE SET NULL,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);
  `);
  db.exec(`
    INSERT OR IGNORE INTO inventory_movements (
      id, barang_id, tanggal, movement_type, qty_delta, unit_cost, value_delta,
      qty_before, qty_after, avg_cost_before, avg_cost_after,
      source_type, source_id, catatan, dibuat_oleh, sync_status,
      updated_by_device, change_version, is_deleted
    )
    SELECT
      'opening-' || id,
      id,
      date('now'),
      'OPENING_BALANCE',
      COALESCE(jumlah_stok, 0),
      COALESCE(average_cost_per_base_unit, 0),
      COALESCE(jumlah_stok, 0) * COALESCE(average_cost_per_base_unit, 0),
      0,
      COALESCE(jumlah_stok, 0),
      0,
      COALESCE(average_cost_per_base_unit, 0),
      'OPENING',
      id,
      'Backfill stok awal sebelum ledger aktif',
      NULL,
      'synced',
      'local',
      1,
      0
    FROM barang
    WHERE COALESCE(lacak_inventori_status, 1) <> 0
      AND COALESCE(jumlah_stok, 0) <> 0;
  `);

  const inventoryMovementSql = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = 'inventory_movements'")
      .get() as { sql?: string } | undefined
  )?.sql;
  if (
    inventoryMovementSql &&
    !inventoryMovementSql.includes("'PRODUCTION_ISSUE'")
  ) {
    const oldName = "inventory_movements_old_sale_return";
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN TRANSACTION;");
    try {
      db.exec(`ALTER TABLE inventory_movements RENAME TO ${oldName};`);
      db.exec(`
        CREATE TABLE inventory_movements (
          id TEXT PRIMARY KEY,
          barang_id TEXT NOT NULL,
          tanggal TEXT NOT NULL,
          movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING_BALANCE','PURCHASE_RECEIPT','SALE_ISSUE','SALE_VOID','SALE_RETURN','PURCHASE_VOID','PURCHASE_RETURN','ADJUSTMENT','WASTE','ROLL_CONVERSION_OUT','ROLL_CONVERSION_IN','PRODUCTION_ISSUE','PRODUCTION_WASTE')),
          qty_delta REAL NOT NULL,
          unit_cost REAL NOT NULL DEFAULT 0,
          value_delta REAL NOT NULL DEFAULT 0,
          qty_before REAL NOT NULL DEFAULT 0,
          qty_after REAL NOT NULL DEFAULT 0,
          avg_cost_before REAL NOT NULL DEFAULT 0,
          avg_cost_after REAL NOT NULL DEFAULT 0,
          source_type TEXT NOT NULL,
          source_id TEXT NOT NULL,
          source_line_id TEXT,
          reversal_of_id TEXT,
          catatan TEXT,
          dibuat_oleh TEXT,
          dibuat_pada TEXT DEFAULT (datetime('now')),
          diperbarui_pada TEXT DEFAULT (datetime('now')),
          sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
          last_synced_at TEXT,
          sync_version INTEGER DEFAULT 1,
          updated_at_server TEXT,
          updated_by_device TEXT DEFAULT 'server',
          change_version INTEGER DEFAULT 1,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          deleted_at TEXT,
          client_mutation_id TEXT,
          location_id TEXT DEFAULT 'main',
          roll_variant_id TEXT,
          roll_width_m REAL,
          linear_delta_m REAL,
          FOREIGN KEY (barang_id) REFERENCES barang(id),
          FOREIGN KEY (reversal_of_id) REFERENCES inventory_movements(id),
          FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id) ON DELETE SET NULL,
          FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
        );
      `);
      const targetCols = (
        db.prepare("PRAGMA table_info(inventory_movements)").all() as Array<{ name: string }>
      ).map((c) => c.name);
      const oldCols = new Set(
        (
          db.prepare(`PRAGMA table_info(${oldName})`).all() as Array<{ name: string }>
        ).map((c) => c.name)
      );
      const commonCols = targetCols.filter((name) => oldCols.has(name));
      if (commonCols.length > 0) {
        db.exec(`
          INSERT INTO inventory_movements (${commonCols.join(", ")})
          SELECT ${commonCols.join(", ")}
          FROM ${oldName}
        `);
      }
      db.exec(`DROP TABLE ${oldName};`);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys = ON;");
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_barang ON inventory_movements(barang_id, dibuat_pada);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_source ON inventory_movements(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_line ON inventory_movements(source_line_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_sync_status ON inventory_movements(sync_status);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_location ON inventory_movements(location_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_movements_roll_variant ON inventory_movements(roll_variant_id, dibuat_pada);
    `);
  }

  const lifecycleTables = [
    { table: "pembelian", statuses: "'DRAFT','POSTED','VOIDED'" },
    { table: "penjualan", statuses: "'DRAFT','POSTED','VOIDED'" },
    { table: "keuangan", statuses: "'POSTED','VOIDED'" },
  ];
  for (const { table, statuses } of lifecycleTables) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(table);
    if (!exists) continue;
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!cols.includes("status_transaksi")) {
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN status_transaksi TEXT NOT NULL DEFAULT 'POSTED' CHECK(status_transaksi IN (${statuses}))`
      );
    }
    if (!cols.includes("voided_at")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN voided_at TEXT`);
    }
    if (!cols.includes("voided_by")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN voided_by TEXT`);
    }
    if (!cols.includes("void_reason")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN void_reason TEXT`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${table}_status_transaksi ON ${table}(status_transaksi)`
    );
  }

  // ── PPN columns ───────────────────────────────────────────────────────────
  // Identitas + status PKP toko (singleton 'default').
  db.exec(`
    CREATE TABLE IF NOT EXISTS pengaturan_toko (
      id TEXT PRIMARY KEY DEFAULT 'default',
      nama_toko TEXT NOT NULL DEFAULT 'Toko',
      slogan TEXT,
      alamat TEXT,
      telepon TEXT,
      email TEXT,
      website TEXT,
      bank_nama TEXT,
      bank_nomor TEXT,
      bank_atas_nama TEXT,
      catatan_faktur TEXT,
      catatan_struk TEXT,
      npwp TEXT,
      alamat_npwp TEXT,
      status_pkp INTEGER NOT NULL DEFAULT 0,
      ppn_persen_default REAL NOT NULL DEFAULT 11,
      ppn_metode_default TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode_default IN ('EKSKLUSIF','INKLUSIF')),
      ppn_default_aktif INTEGER NOT NULL DEFAULT 0,
      nsfp_kode_transaksi_default TEXT NOT NULL DEFAULT '01',
      nsfp_tahun_aktif TEXT,
      nsfp_seri_terakhir TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );
    INSERT OR IGNORE INTO pengaturan_toko (
      id, nama_toko, slogan, bank_nama, bank_nomor, bank_atas_nama,
      catatan_faktur, catatan_struk
    ) VALUES (
      'default', 'gemiprint', 'Digital Printing & Advertising', 'BCA',
      '6881276507', 'PT. Grafika Estetika Media Internusa',
      'Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.',
      'Barang yang sudah dibeli tidak dapat dikembalikan'
    );

    CREATE TABLE IF NOT EXISTS nsfp_pool (
      id TEXT PRIMARY KEY,
      tahun TEXT NOT NULL,
      kode_transaksi TEXT NOT NULL DEFAULT '01',
      nomor_seri TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'TERSEDIA' CHECK(status IN ('TERSEDIA','TERPAKAI','BATAL')),
      penjualan_id TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      UNIQUE (tahun, kode_transaksi, nomor_seri)
    );
    CREATE INDEX IF NOT EXISTS idx_nsfp_pool_status ON nsfp_pool(status, tahun, nomor_seri);
    CREATE INDEX IF NOT EXISTS idx_nsfp_pool_penjualan ON nsfp_pool(penjualan_id);
  `);

  // PPN columns on existing tables — additive, idempotent.
  const ppnAdditiveCols: Array<{ table: string; column: string; ddl: string }> = [
    { table: "pelanggan", column: "alamat_npwp", ddl: "ALTER TABLE pelanggan ADD COLUMN alamat_npwp TEXT" },
    { table: "pelanggan", column: "nama_di_npwp", ddl: "ALTER TABLE pelanggan ADD COLUMN nama_di_npwp TEXT" },
    { table: "vendor", column: "npwp", ddl: "ALTER TABLE vendor ADD COLUMN npwp TEXT" },
    { table: "vendor", column: "alamat_npwp", ddl: "ALTER TABLE vendor ADD COLUMN alamat_npwp TEXT" },
    { table: "vendor", column: "nama_di_npwp", ddl: "ALTER TABLE vendor ADD COLUMN nama_di_npwp TEXT" },

    { table: "penjualan", column: "kena_ppn", ddl: "ALTER TABLE penjualan ADD COLUMN kena_ppn INTEGER NOT NULL DEFAULT 0" },
    { table: "penjualan", column: "ppn_persen", ddl: "ALTER TABLE penjualan ADD COLUMN ppn_persen REAL NOT NULL DEFAULT 0" },
    { table: "penjualan", column: "ppn_metode", ddl: "ALTER TABLE penjualan ADD COLUMN ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF'))" },
    { table: "penjualan", column: "dpp_total", ddl: "ALTER TABLE penjualan ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0" },
    { table: "penjualan", column: "ppn_total", ddl: "ALTER TABLE penjualan ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0" },
    { table: "penjualan", column: "nsfp_kode_transaksi", ddl: "ALTER TABLE penjualan ADD COLUMN nsfp_kode_transaksi TEXT" },
    { table: "penjualan", column: "nsfp_tahun", ddl: "ALTER TABLE penjualan ADD COLUMN nsfp_tahun TEXT" },
    { table: "penjualan", column: "nsfp_nomor_seri", ddl: "ALTER TABLE penjualan ADD COLUMN nsfp_nomor_seri TEXT" },
    { table: "penjualan", column: "tanggal_faktur_pajak", ddl: "ALTER TABLE penjualan ADD COLUMN tanggal_faktur_pajak TEXT" },
    { table: "penjualan", column: "pelanggan_npwp_snapshot", ddl: "ALTER TABLE penjualan ADD COLUMN pelanggan_npwp_snapshot TEXT" },
    { table: "penjualan", column: "pelanggan_alamat_npwp_snapshot", ddl: "ALTER TABLE penjualan ADD COLUMN pelanggan_alamat_npwp_snapshot TEXT" },
    { table: "penjualan", column: "pelanggan_nama_npwp_snapshot", ddl: "ALTER TABLE penjualan ADD COLUMN pelanggan_nama_npwp_snapshot TEXT" },

    { table: "item_penjualan", column: "dpp_satuan", ddl: "ALTER TABLE item_penjualan ADD COLUMN dpp_satuan REAL NOT NULL DEFAULT 0" },
    { table: "item_penjualan", column: "ppn_satuan", ddl: "ALTER TABLE item_penjualan ADD COLUMN ppn_satuan REAL NOT NULL DEFAULT 0" },
    { table: "item_penjualan", column: "dpp_total", ddl: "ALTER TABLE item_penjualan ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0" },
    { table: "item_penjualan", column: "ppn_total", ddl: "ALTER TABLE item_penjualan ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0" },

    { table: "pembelian", column: "kena_ppn", ddl: "ALTER TABLE pembelian ADD COLUMN kena_ppn INTEGER NOT NULL DEFAULT 0" },
    { table: "pembelian", column: "ppn_persen", ddl: "ALTER TABLE pembelian ADD COLUMN ppn_persen REAL NOT NULL DEFAULT 0" },
    { table: "pembelian", column: "ppn_metode", ddl: "ALTER TABLE pembelian ADD COLUMN ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF'))" },
    { table: "pembelian", column: "dpp_total", ddl: "ALTER TABLE pembelian ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0" },
    { table: "pembelian", column: "ppn_total", ddl: "ALTER TABLE pembelian ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0" },
    { table: "pembelian", column: "dapat_dikreditkan", ddl: "ALTER TABLE pembelian ADD COLUMN dapat_dikreditkan INTEGER NOT NULL DEFAULT 1" },
    { table: "pembelian", column: "nomor_faktur_pajak_vendor", ddl: "ALTER TABLE pembelian ADD COLUMN nomor_faktur_pajak_vendor TEXT" },
    { table: "pembelian", column: "tanggal_faktur_pajak", ddl: "ALTER TABLE pembelian ADD COLUMN tanggal_faktur_pajak TEXT" },
    { table: "pembelian", column: "vendor_npwp_snapshot", ddl: "ALTER TABLE pembelian ADD COLUMN vendor_npwp_snapshot TEXT" },

    { table: "item_pembelian", column: "dpp_satuan", ddl: "ALTER TABLE item_pembelian ADD COLUMN dpp_satuan REAL NOT NULL DEFAULT 0" },
    { table: "item_pembelian", column: "ppn_satuan", ddl: "ALTER TABLE item_pembelian ADD COLUMN ppn_satuan REAL NOT NULL DEFAULT 0" },
    { table: "item_pembelian", column: "dpp_total", ddl: "ALTER TABLE item_pembelian ADD COLUMN dpp_total REAL NOT NULL DEFAULT 0" },
    { table: "item_pembelian", column: "ppn_total", ddl: "ALTER TABLE item_pembelian ADD COLUMN ppn_total REAL NOT NULL DEFAULT 0" },
  ];

  for (const { table, column, ddl } of ppnAdditiveCols) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(table);
    if (!exists) continue;
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!cols.includes(column)) {
      db.exec(ddl);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_penjualan_kena_ppn ON penjualan(kena_ppn);
    CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal_faktur_pajak ON penjualan(tanggal_faktur_pajak);
    CREATE INDEX IF NOT EXISTS idx_pembelian_kena_ppn ON pembelian(kena_ppn);
    CREATE INDEX IF NOT EXISTS idx_pembelian_dapat_dikreditkan ON pembelian(dapat_dikreditkan);
    CREATE INDEX IF NOT EXISTS idx_pembelian_tanggal_faktur_pajak ON pembelian(tanggal_faktur_pajak);
  `);

  // ── Long-term hardening: lokasi + accounting_periods + reference_id ─────
  db.exec(`
    CREATE TABLE IF NOT EXISTS lokasi (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      kode TEXT UNIQUE,
      alamat TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );
    INSERT OR IGNORE INTO lokasi (id, nama, kode, is_default, aktif_status)
      VALUES ('main', 'Gudang Utama', 'MAIN', 1, 1);

    CREATE TABLE IF NOT EXISTS accounting_periods (
      id TEXT PRIMARY KEY,
      period_key TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
      closed_at TEXT,
      closed_by TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
      ON accounting_periods(status, start_date, end_date);
  `);

  const hardeningCols: Array<{ table: string; column: string; ddl: string }> = [
    { table: "inventory_movements", column: "location_id", ddl: "ALTER TABLE inventory_movements ADD COLUMN location_id TEXT DEFAULT 'main'" },
    { table: "barang", column: "default_location_id", ddl: "ALTER TABLE barang ADD COLUMN default_location_id TEXT DEFAULT 'main'" },
    { table: "keuangan", column: "reference_type", ddl: "ALTER TABLE keuangan ADD COLUMN reference_type TEXT" },
    { table: "keuangan", column: "reference_id", ddl: "ALTER TABLE keuangan ADD COLUMN reference_id TEXT" },
  ];
  for (const { table, column, ddl } of hardeningCols) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(table);
    if (!exists) continue;
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!cols.includes(column)) {
      db.exec(ddl);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_location ON inventory_movements(location_id);
    CREATE INDEX IF NOT EXISTS idx_keuangan_reference ON keuangan(reference_type, reference_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS barang_roll_variants (
      id TEXT PRIMARY KEY,
      barang_id TEXT NOT NULL,
      lebar_m REAL NOT NULL,
      panjang_tersedia_m REAL NOT NULL DEFAULT 0,
      average_cost_per_m2 REAL NOT NULL DEFAULT 0,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE,
      CONSTRAINT barang_roll_variants_width_positive CHECK(lebar_m > 0),
      CONSTRAINT barang_roll_variants_length_nonnegative CHECK(panjang_tersedia_m >= 0),
      CONSTRAINT barang_roll_variants_unique_width UNIQUE(barang_id, lebar_m)
    );
    CREATE INDEX IF NOT EXISTS idx_barang_roll_variants_barang
      ON barang_roll_variants(barang_id, aktif_status, lebar_m);

    CREATE TABLE IF NOT EXISTS production_material_consumptions (
      id TEXT PRIMARY KEY,
      item_produksi_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      roll_variant_id TEXT NOT NULL,
      roll_width_m REAL NOT NULL,
      linear_used_m REAL NOT NULL,
      area_used_m2 REAL NOT NULL,
      billed_area_m2 REAL NOT NULL DEFAULT 0,
      waste_area_m2 REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      waste_movement_id TEXT,
      operator_id TEXT,
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','VOIDED')),
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (item_produksi_id) REFERENCES item_produksi(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (roll_variant_id) REFERENCES barang_roll_variants(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (waste_movement_id) REFERENCES inventory_movements(id),
      FOREIGN KEY (operator_id) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_production_consumptions_item
      ON production_material_consumptions(item_produksi_id, status);
    CREATE INDEX IF NOT EXISTS idx_production_consumptions_roll
      ON production_material_consumptions(roll_variant_id, dibuat_pada);
  `);

  const rollInventoryCols: Array<{ table: string; column: string; ddl: string }> = [
    { table: "barang", column: "roll_inventory_status", ddl: "ALTER TABLE barang ADD COLUMN roll_inventory_status INTEGER NOT NULL DEFAULT 0" },
    { table: "inventory_movements", column: "roll_variant_id", ddl: "ALTER TABLE inventory_movements ADD COLUMN roll_variant_id TEXT" },
    { table: "inventory_movements", column: "roll_width_m", ddl: "ALTER TABLE inventory_movements ADD COLUMN roll_width_m REAL" },
    { table: "inventory_movements", column: "linear_delta_m", ddl: "ALTER TABLE inventory_movements ADD COLUMN linear_delta_m REAL" },
    { table: "item_penjualan", column: "billed_panjang", ddl: "ALTER TABLE item_penjualan ADD COLUMN billed_panjang REAL" },
    { table: "item_penjualan", column: "billed_lebar", ddl: "ALTER TABLE item_penjualan ADD COLUMN billed_lebar REAL" },
    { table: "item_penjualan", column: "recommended_roll_width_m", ddl: "ALTER TABLE item_penjualan ADD COLUMN recommended_roll_width_m REAL" },
    { table: "item_penjualan", column: "roll_inventory_deferred", ddl: "ALTER TABLE item_penjualan ADD COLUMN roll_inventory_deferred INTEGER NOT NULL DEFAULT 0" },
    { table: "item_produksi", column: "barang_id", ddl: "ALTER TABLE item_produksi ADD COLUMN barang_id TEXT" },
    { table: "item_produksi", column: "billed_panjang", ddl: "ALTER TABLE item_produksi ADD COLUMN billed_panjang REAL" },
    { table: "item_produksi", column: "billed_lebar", ddl: "ALTER TABLE item_produksi ADD COLUMN billed_lebar REAL" },
    { table: "item_produksi", column: "recommended_roll_width_m", ddl: "ALTER TABLE item_produksi ADD COLUMN recommended_roll_width_m REAL" },
    { table: "item_produksi", column: "roll_inventory_status", ddl: "ALTER TABLE item_produksi ADD COLUMN roll_inventory_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'" },
  ];
  for (const { table, column, ddl } of rollInventoryCols) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(table);
    if (!exists) continue;
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!cols.includes(column)) {
      db.exec(ddl);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_roll_variant
      ON inventory_movements(roll_variant_id, dibuat_pada);
  `);

  const commercialWorkflowCols: Array<{ table: string; column: string; ddl: string }> = [
    { table: "penjualan", column: "penawaran_id", ddl: "ALTER TABLE penjualan ADD COLUMN penawaran_id TEXT" },
    { table: "pembelian", column: "purchase_order_id", ddl: "ALTER TABLE pembelian ADD COLUMN purchase_order_id TEXT" },
    { table: "item_pembelian", column: "purchase_order_item_id", ddl: "ALTER TABLE item_pembelian ADD COLUMN purchase_order_item_id TEXT" },
  ];
  for (const { table, column, ddl } of commercialWorkflowCols) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(table);
    if (!exists) continue;
    const cols = (
      db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!cols.includes(column)) {
      db.exec(ddl);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS penawaran (
      id TEXT PRIMARY KEY,
      nomor_penawaran TEXT UNIQUE NOT NULL,
      pelanggan_id TEXT,
      pelanggan_nama_snapshot TEXT,
      pelanggan_kota TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      berlaku_sampai TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENT','ACCEPTED','CONVERTED','CANCELLED','EXPIRED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      converted_penjualan_id TEXT,
      converted_at TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (pelanggan_id) REFERENCES pelanggan(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (converted_penjualan_id) REFERENCES penjualan(id)
    );
    CREATE INDEX IF NOT EXISTS idx_penawaran_status ON penawaran(status, tanggal);
    CREATE INDEX IF NOT EXISTS idx_penawaran_pelanggan ON penawaran(pelanggan_id);

    CREATE TABLE IF NOT EXISTS item_penawaran (
      id TEXT PRIMARY KEY,
      penawaran_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      panjang REAL,
      lebar REAL,
      tipe_item TEXT NOT NULL DEFAULT 'BARANG' CHECK(tipe_item IN ('BARANG','JASA','MAKLON')),
      vendor_subkontrak_id TEXT,
      biaya_subkontrak REAL,
      metode_bayar_vendor TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30')),
      deskripsi_pekerjaan TEXT,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (penawaran_id) REFERENCES penawaran(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id),
      FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_item_penawaran_doc ON item_penawaran(penawaran_id);

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      nomor_po TEXT UNIQUE NOT NULL,
      vendor_id TEXT,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      expected_date TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENT','PARTIAL_RECEIVED','RECEIVED','CANCELLED')),
      total_jumlah REAL NOT NULL DEFAULT 0,
      kena_ppn INTEGER NOT NULL DEFAULT 0,
      ppn_persen REAL NOT NULL DEFAULT 0,
      ppn_metode TEXT NOT NULL DEFAULT 'EKSKLUSIF' CHECK(ppn_metode IN ('EKSKLUSIF','INKLUSIF')),
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendor(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status, tanggal);
    CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      harga_satuan_id TEXT,
      jumlah REAL NOT NULL,
      qty_received REAL NOT NULL DEFAULT 0,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      panjang REAL,
      lebar REAL,
      dpp_satuan REAL NOT NULL DEFAULT 0,
      ppn_satuan REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_order_items_doc ON purchase_order_items(purchase_order_id);

    CREATE TABLE IF NOT EXISTS retur_penjualan (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT UNIQUE NOT NULL,
      penjualan_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
      total_retur REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      total_hpp REAL NOT NULL DEFAULT 0,
      receivable_reduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (penjualan_id) REFERENCES penjualan(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_retur_penjualan_sale ON retur_penjualan(penjualan_id, tanggal);

    CREATE TABLE IF NOT EXISTS item_retur_penjualan (
      id TEXT PRIMARY KEY,
      retur_penjualan_id TEXT NOT NULL,
      item_penjualan_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      qty REAL NOT NULL,
      qty_base REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      hpp_satuan REAL NOT NULL DEFAULT 0,
      hpp_total REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (retur_penjualan_id) REFERENCES retur_penjualan(id) ON DELETE CASCADE,
      FOREIGN KEY (item_penjualan_id) REFERENCES item_penjualan(id),
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
    CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_doc ON item_retur_penjualan(retur_penjualan_id);
    CREATE INDEX IF NOT EXISTS idx_item_retur_penjualan_source ON item_retur_penjualan(item_penjualan_id);

    CREATE TABLE IF NOT EXISTS retur_pembelian (
      id TEXT PRIMARY KEY,
      nomor_retur TEXT UNIQUE NOT NULL,
      pembelian_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'POSTED' CHECK(status IN ('POSTED','CANCELLED')),
      total_retur REAL NOT NULL DEFAULT 0,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      debt_reduction REAL NOT NULL DEFAULT 0,
      refund_amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL,
      catatan TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (pembelian_id) REFERENCES pembelian(id),
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_retur_pembelian_purchase ON retur_pembelian(pembelian_id, tanggal);

    CREATE TABLE IF NOT EXISTS item_retur_pembelian (
      id TEXT PRIMARY KEY,
      retur_pembelian_id TEXT NOT NULL,
      item_pembelian_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      qty REAL NOT NULL,
      qty_base REAL NOT NULL,
      nama_satuan TEXT NOT NULL,
      faktor_konversi REAL NOT NULL DEFAULT 1,
      harga_satuan REAL NOT NULL,
      subtotal REAL NOT NULL,
      dpp_total REAL NOT NULL DEFAULT 0,
      ppn_total REAL NOT NULL DEFAULT 0,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (retur_pembelian_id) REFERENCES retur_pembelian(id) ON DELETE CASCADE,
      FOREIGN KEY (item_pembelian_id) REFERENCES item_pembelian(id),
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
    CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_doc ON item_retur_pembelian(retur_pembelian_id);
    CREATE INDEX IF NOT EXISTS idx_item_retur_pembelian_source ON item_retur_pembelian(item_pembelian_id);

    CREATE TABLE IF NOT EXISTS stock_opnames (
      id TEXT PRIMARY KEY,
      nomor_opname TEXT UNIQUE NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','CANCELLED')),
      catatan TEXT,
      dibuat_oleh TEXT,
      posted_at TEXT,
      posted_by TEXT,
      total_items INTEGER NOT NULL DEFAULT 0,
      total_delta_qty REAL NOT NULL DEFAULT 0,
      total_delta_value REAL NOT NULL DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (dibuat_oleh) REFERENCES profil(id),
      FOREIGN KEY (posted_by) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_opnames_status ON stock_opnames(status, tanggal);

    CREATE TABLE IF NOT EXISTS stock_opname_items (
      id TEXT PRIMARY KEY,
      stock_opname_id TEXT NOT NULL,
      barang_id TEXT NOT NULL,
      system_qty REAL NOT NULL DEFAULT 0,
      counted_qty REAL,
      delta_qty REAL NOT NULL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0,
      delta_value REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      movement_id TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 1,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (stock_opname_id) REFERENCES stock_opnames(id) ON DELETE CASCADE,
      FOREIGN KEY (barang_id) REFERENCES barang(id),
      FOREIGN KEY (movement_id) REFERENCES inventory_movements(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_doc ON stock_opname_items(stock_opname_id);
    CREATE INDEX IF NOT EXISTS idx_stock_opname_items_barang ON stock_opname_items(barang_id);
    CREATE INDEX IF NOT EXISTS idx_penjualan_penawaran ON penjualan(penawaran_id);
    CREATE INDEX IF NOT EXISTS idx_pembelian_purchase_order ON pembelian(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_item_pembelian_po_item ON item_pembelian(purchase_order_item_id);
  `);

  const financeCategoryExistsForReturns = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'finance_category_definitions' LIMIT 1"
    )
    .get();
  if (financeCategoryExistsForReturns) {
    const catCols = (
      db.prepare("PRAGMA table_info(finance_category_definitions)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    const hasMetricContrib = catCols.includes("metric_contributions");
    const columns = hasMetricContrib
      ? `(id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order, metric_contributions)`
      : `(id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order)`;
    const values = hasMetricContrib
      ? `
        ('fin-cat-retur-penjualan', 'RETUR_PENJUALAN', 'Retur Penjualan', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 32, '[{"column":"omzet","amount_field":"kredit","sign":-1}]'),
        ('fin-cat-retur-penjualan-noncash', 'RETUR_PENJUALAN_NONCASH', 'Retur Penjualan (non-kas)', 'bg-rose-50', 'text-rose-700', 'border-rose-200', 'kredit', 1, 33, '[{"column":"omzet","amount_field":"kredit","sign":-1}]'),
        ('fin-cat-retur-hpp', 'RETUR_HPP', 'Retur HPP', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'debit', 1, 76, '[{"column":"biaya_bahan","amount_field":"debit","sign":-1}]'),
        ('fin-cat-retur-pembelian', 'RETUR_PEMBELIAN', 'Retur Pembelian', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'debit', 1, 72, '[]')
      `
      : `
        ('fin-cat-retur-penjualan', 'RETUR_PENJUALAN', 'Retur Penjualan', 'bg-rose-100', 'text-rose-800', 'border-rose-300', 'kredit', 1, 32),
        ('fin-cat-retur-penjualan-noncash', 'RETUR_PENJUALAN_NONCASH', 'Retur Penjualan (non-kas)', 'bg-rose-50', 'text-rose-700', 'border-rose-200', 'kredit', 1, 33),
        ('fin-cat-retur-hpp', 'RETUR_HPP', 'Retur HPP', 'bg-slate-100', 'text-slate-800', 'border-slate-300', 'debit', 1, 76),
        ('fin-cat-retur-pembelian', 'RETUR_PEMBELIAN', 'Retur Pembelian', 'bg-emerald-100', 'text-emerald-800', 'border-emerald-300', 'debit', 1, 72)
      `;
    db.exec(`
      INSERT OR IGNORE INTO finance_category_definitions ${columns}
      VALUES ${values};
      ${
        hasMetricContrib
          ? `UPDATE finance_category_definitions
             SET metric_contributions = '[{"column":"omzet","amount_field":"kredit","sign":-1}]'
             WHERE category_code = 'RETUR_PENJUALAN';
             UPDATE finance_category_definitions
             SET metric_contributions = '[{"column":"omzet","amount_field":"kredit","sign":-1}]'
             WHERE category_code = 'RETUR_PENJUALAN_NONCASH';
             UPDATE finance_category_definitions
             SET metric_contributions = '[{"column":"biaya_bahan","amount_field":"debit","sign":-1}]'
             WHERE category_code = 'RETUR_HPP';
             UPDATE finance_category_definitions
             SET metric_contributions = '[]'
             WHERE category_code = 'RETUR_PEMBELIAN';`
          : ""
      }
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
    if (!ipCols.includes("jumlah_roll")) {
      db.exec(
        `ALTER TABLE item_pembelian ADD COLUMN jumlah_roll INTEGER NOT NULL DEFAULT 1`
      );
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
    // Maklon support: per-line subcontract metadata. Mirror of supabase
    // migration 20260523230000_maklon_support.sql. Lines with tipe_item='MAKLON'
    // carry vendor_subkontrak_id + biaya_subkontrak and a back-link to the
    // auto-created pembelian.
    if (!ijCols.includes("tipe_item")) {
      db.exec(
        `ALTER TABLE item_penjualan ADD COLUMN tipe_item TEXT NOT NULL DEFAULT 'BARANG'`
      );
    }
    if (!ijCols.includes("vendor_subkontrak_id")) {
      db.exec(
        `ALTER TABLE item_penjualan ADD COLUMN vendor_subkontrak_id TEXT`
      );
    }
    if (!ijCols.includes("biaya_subkontrak")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN biaya_subkontrak REAL`);
    }
    if (!ijCols.includes("metode_bayar_vendor")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN metode_bayar_vendor TEXT`);
    }
    if (!ijCols.includes("pembelian_id_terkait")) {
      db.exec(
        `ALTER TABLE item_penjualan ADD COLUMN pembelian_id_terkait TEXT`
      );
    }
    if (!ijCols.includes("deskripsi_pekerjaan")) {
      db.exec(`ALTER TABLE item_penjualan ADD COLUMN deskripsi_pekerjaan TEXT`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_item_penjualan_tipe_item ON item_penjualan(tipe_item)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_item_penjualan_pembelian_terkait ON item_penjualan(pembelian_id_terkait)`
    );
  }

  const pengaturanTokoExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'pengaturan_toko' LIMIT 1"
    )
    .get();
  if (pengaturanTokoExists) {
    const pengaturanTokoCols = (
      db.prepare("PRAGMA table_info(pengaturan_toko)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    if (!pengaturanTokoCols.includes("slogan")) {
      db.exec(`ALTER TABLE pengaturan_toko ADD COLUMN slogan TEXT`);
      db.exec(`
        UPDATE pengaturan_toko
        SET slogan = COALESCE(slogan, 'Digital Printing & Advertising')
        WHERE id = 'default'
      `);
    }
    const pengaturanTokoExtraColumns: Array<{
      name: string;
      sql: string;
      defaultValue?: string;
    }> = [
      { name: "website", sql: "website TEXT" },
      { name: "bank_nama", sql: "bank_nama TEXT", defaultValue: "BCA" },
      { name: "bank_nomor", sql: "bank_nomor TEXT", defaultValue: "6881276507" },
      {
        name: "bank_atas_nama",
        sql: "bank_atas_nama TEXT",
        defaultValue: "PT. Grafika Estetika Media Internusa",
      },
      {
        name: "catatan_faktur",
        sql: "catatan_faktur TEXT",
        defaultValue: "Barang yang sudah dibawa tidak bisa ditukar/dikembalikan.",
      },
      {
        name: "catatan_struk",
        sql: "catatan_struk TEXT",
        defaultValue: "Barang yang sudah dibeli tidak dapat dikembalikan",
      },
    ];
    for (const column of pengaturanTokoExtraColumns) {
      if (!pengaturanTokoCols.includes(column.name)) {
        db.exec(`ALTER TABLE pengaturan_toko ADD COLUMN ${column.sql}`);
        if (column.defaultValue) {
          const escapedDefault = column.defaultValue.replace(/'/g, "''");
          db.exec(`
            UPDATE pengaturan_toko
            SET ${column.name} = COALESCE(${column.name}, '${escapedDefault}')
            WHERE id = 'default'
          `);
        }
      }
    }
  }

  // Maklon: pembelian back-link to the sale that triggered it.
  const pembelianExistsForMaklon = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'pembelian' LIMIT 1"
    )
    .get();
  if (pembelianExistsForMaklon) {
    const pemCols = (
      db.prepare("PRAGMA table_info(pembelian)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    if (!pemCols.includes("tipe_pembelian")) {
      db.exec(
        `ALTER TABLE pembelian ADD COLUMN tipe_pembelian TEXT NOT NULL DEFAULT 'BARANG'`
      );
    }
    if (!pemCols.includes("penjualan_id_sumber")) {
      db.exec(`ALTER TABLE pembelian ADD COLUMN penjualan_id_sumber TEXT`);
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pembelian_penjualan_sumber ON pembelian(penjualan_id_sumber)`
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pembelian_tipe ON pembelian(tipe_pembelian)`
    );
  }

  // Maklon: vendor classification (SUPPLIER / SUBKONTRAKTOR / KEDUANYA).
  const vendorExistsForMaklon = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'vendor' LIMIT 1"
    )
    .get();
  if (vendorExistsForMaklon) {
    const venCols = (
      db.prepare("PRAGMA table_info(vendor)").all() as Array<{ name: string }>
    ).map((c) => c.name);
    if (!venCols.includes("tipe_vendor")) {
      db.exec(
        `ALTER TABLE vendor ADD COLUMN tipe_vendor TEXT NOT NULL DEFAULT 'SUPPLIER'`
      );
    }
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_vendor_tipe ON vendor(tipe_vendor)`
    );
  }

  const omzetReturnAst = `{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"or","left":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"OMZET"},"within":{"type":"columnRef","column":"C"}}}},"right":{"type":"not","arg":{"type":"iserror","arg":{"type":"search","find":{"type":"literal","value":"PIUTANG"},"within":{"type":"columnRef","column":"C"}}}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"binaryOp","op":"-","left":{"type":"literal","value":0},"right":{"type":"columnRef","column":"E"}},"else":{"type":"columnRef","column":"D"}},"else":{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"G"},"right":{"type":"columnRef","column":"D"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"G"}}}`;
  const hppAst = `{"type":"if","cond":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}},"then":{"type":"binaryOp","op":"-","left":{"type":"literal","value":0},"right":{"type":"columnRef","column":"D"}},"else":{"type":"columnRef","column":"E"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}},"then":{"type":"binaryOp","op":"-","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"D"}},"else":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"I"},"right":{"type":"columnRef","column":"E"}}}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"I"}}}`;
  const saldoReturnAst = `{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"HPP"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_HPP"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"RETUR_PENJUALAN_NONCASH"}}},"then":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"literal","value":0},"else":{"type":"prevOutput","column":"J"}},"else":{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"binaryOp","op":"-","left":{"type":"columnRef","column":"D"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"binaryOp","op":"-","left":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"J"},"right":{"type":"columnRef","column":"D"}},"right":{"type":"columnRef","column":"E"}}}}`;
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

  // Maklon: separate finance category so users can filter "biaya maklon"
  // independently from supplier purchases (SUPPLY).
  if (financeCategoryExists) {
    db.exec(`
      INSERT OR IGNORE INTO finance_category_definitions
        (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order)
      VALUES
        ('fin-cat-maklon', 'MAKLON', 'Maklon', 'bg-fuchsia-100', 'text-fuchsia-800', 'border-fuchsia-300', 'kredit', 1, 78);
    `);
  }

  // Penggajian: GAJI (beban, mengurangi laba) + PINJAMAN_KARYAWAN (kasbon =
  // piutang, NETRAL terhadap laba). metric_contributions menentukan dampak laba:
  // GAJI → biaya_operasional; PINJAMAN_KARYAWAN → [] (hanya kas/saldo bergerak).
  if (financeCategoryExists) {
    const gajiCatCols = (
      db.prepare("PRAGMA table_info(finance_category_definitions)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);
    if (gajiCatCols.includes("metric_contributions")) {
      db.exec(`
        INSERT OR IGNORE INTO finance_category_definitions
          (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order, metric_contributions)
        VALUES
          ('fin-cat-gaji', 'GAJI', 'Gaji', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'kredit', 1, 130, '[{"column":"biaya_operasional","amount_field":"kredit","sign":1}]'),
          ('fin-cat-pinjaman-karyawan', 'PINJAMAN_KARYAWAN', 'Pinjaman Karyawan', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'both', 1, 140, '[]');
      `);
    } else {
      db.exec(`
        INSERT OR IGNORE INTO finance_category_definitions
          (id, category_code, display_name, color_bg, color_text, color_border, direction, is_active, display_order)
        VALUES
          ('fin-cat-gaji', 'GAJI', 'Gaji', 'bg-teal-100', 'text-teal-800', 'border-teal-300', 'kredit', 1, 130),
          ('fin-cat-pinjaman-karyawan', 'PINJAMAN_KARYAWAN', 'Pinjaman Karyawan', 'bg-cyan-100', 'text-cyan-800', 'border-cyan-300', 'both', 1, 140);
      `);
    }
  }

  // Maklon: placeholder barang for sale lines + auto-generated PO line items.
  // lacak_inventori_status=0 so stock never moves; cost is captured per line
  // via biaya_subkontrak / harga_satuan instead.
  const barangExistsForMaklon = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'barang' LIMIT 1"
    )
    .get();
  if (barangExistsForMaklon) {
    db.exec(`
      INSERT OR IGNORE INTO barang
        (id, nama, deskripsi, kategori_id, satuan_dasar, jumlah_stok, average_cost_per_base_unit,
         level_stok_minimum, lacak_inventori_status, butuh_dimensi_status)
      VALUES
        ('barang-jasa-maklon', 'Jasa Maklon Cetak',
         'Placeholder untuk pekerjaan yang dikerjakan vendor subkontraktor (auto-generated, jangan diedit).',
         'cat-lain-lain', 'pcs', 0, 0, 0, 0, 0);

      INSERT OR IGNORE INTO harga_barang_satuan
        (id, barang_id, nama_satuan, faktor_konversi, harga_beli, harga_jual, harga_member, default_status, urutan_tampilan)
      VALUES
        ('harga-jasa-maklon-pcs', 'barang-jasa-maklon', 'pcs', 1, 0, 0, 0, 1, 0);
    `);
  }

  const cashbookFormulaExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'rumus_buku_kas' LIMIT 1"
    )
    .get();
  if (cashbookFormulaExists) {
    db.prepare(
      `UPDATE rumus_buku_kas
       SET ast = ?, description = 'Akumulasi penjualan + piutang dikurangi retur penjualan kas dan non-kas.'
       WHERE db_column = 'omzet' OR formula_key = 'omzet'`
    ).run(omzetReturnAst);
    db.prepare(
      `UPDATE rumus_buku_kas
       SET ast = ?, description = 'Akumulasi HPP dikurangi HPP barang yang diretur.'
       WHERE db_column = 'biaya_bahan' OR formula_key = 'biaya_bahan'`
    ).run(hppAst);
    db.prepare(
      `UPDATE rumus_buku_kas
       SET ast = ?, description = 'Saldo kas berjalan; HPP, retur HPP, dan retur penjualan non-kas tidak mengubah kas.'
       WHERE db_column = 'saldo' OR formula_key = 'saldo'`
    ).run(saldoReturnAst);

    // Beban gaji ikut mengurangi laba: tambahkan GAJI ke akumulasi
    // biaya_operasional (kolom H). PINJAMAN_KARYAWAN sengaja dikecualikan
    // (kasbon = piutang, netral terhadap laba).
    const biayaOpsGajiAst = `{"type":"if","cond":{"type":"binaryOp","op":"=","left":{"type":"row"},"right":{"type":"literal","value":2}},"then":{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"GAJI"}}},"then":{"type":"columnRef","column":"E"},"else":{"type":"literal","value":0}},"else":{"type":"if","cond":{"type":"or","left":{"type":"or","left":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"BIAYA"}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"TABUNGAN"}}},"right":{"type":"binaryOp","op":"=","left":{"type":"columnRef","column":"C"},"right":{"type":"literal","value":"GAJI"}}},"then":{"type":"binaryOp","op":"+","left":{"type":"prevOutput","column":"H"},"right":{"type":"columnRef","column":"E"}},"else":{"type":"prevOutput","column":"H"}}}`;
    db.prepare(
      `UPDATE rumus_buku_kas
       SET ast = ?, description = 'Akumulasi BIAYA + TABUNGAN + GAJI (beban gaji ikut mengurangi laba).'
       WHERE db_column = 'biaya_operasional' OR formula_key = 'biaya_operasional'`
    ).run(biayaOpsGajiAst);
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
  // ── Modul Penggajian ────────────────────────────────────────────
  // Empat tabel baru (mirror supabase/migrations/20260609000000_modul_penggajian.sql)
  // agar install SQLite lama ikut bermigrasi saat startup. Semua additive.
  db.exec(`
    CREATE TABLE IF NOT EXISTS komponen_kompensasi (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      tipe TEXT NOT NULL CHECK(tipe IN ('GAJI_POKOK','TUNJANGAN','KOMISI','BONUS')),
      nama TEXT NOT NULL,
      metode TEXT NOT NULL DEFAULT 'TETAP' CHECK(metode IN ('TETAP','PERSEN')),
      nominal REAL NOT NULL DEFAULT 0,
      persen REAL NOT NULL DEFAULT 0,
      sumber_formula_key TEXT,
      aktif_status INTEGER NOT NULL DEFAULT 1,
      urutan_tampilan INTEGER NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_actor ON komponen_kompensasi(actor_id);
    CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_aktif ON komponen_kompensasi(aktif_status);
    CREATE INDEX IF NOT EXISTS idx_komponen_kompensasi_sync ON komponen_kompensasi(sync_status);

    CREATE TABLE IF NOT EXISTS proses_gaji (
      id TEXT PRIMARY KEY,
      periode TEXT NOT NULL,
      tanggal_bayar TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','DIBAYAR','VOIDED')),
      metode_bayar TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar IN ('CASH','TRANSFER')),
      total_bruto REAL NOT NULL DEFAULT 0,
      total_potongan_kasbon REAL NOT NULL DEFAULT 0,
      total_neto REAL NOT NULL DEFAULT 0,
      catatan TEXT,
      dibuat_oleh TEXT,
      voided_at TEXT,
      voided_by TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_proses_gaji_status ON proses_gaji(status);
    CREATE INDEX IF NOT EXISTS idx_proses_gaji_periode ON proses_gaji(periode);
    CREATE INDEX IF NOT EXISTS idx_proses_gaji_sync ON proses_gaji(sync_status);

    CREATE TABLE IF NOT EXISTS slip_gaji (
      id TEXT PRIMARY KEY,
      proses_gaji_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      bruto REAL NOT NULL DEFAULT 0,
      potongan_kasbon REAL NOT NULL DEFAULT 0,
      neto REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','DIBAYAR','VOIDED')),
      metode_bayar TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar IN ('CASH','TRANSFER')),
      keuangan_ref_id TEXT,
      komponen_snapshot TEXT,
      catatan TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_slip_gaji_run ON slip_gaji(proses_gaji_id);
    CREATE INDEX IF NOT EXISTS idx_slip_gaji_actor ON slip_gaji(actor_id);
    CREATE INDEX IF NOT EXISTS idx_slip_gaji_sync ON slip_gaji(sync_status);

    CREATE TABLE IF NOT EXISTS pinjaman_karyawan (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      tanggal TEXT NOT NULL DEFAULT (date('now')),
      jumlah REAL NOT NULL DEFAULT 0,
      jenis TEXT NOT NULL CHECK(jenis IN ('TARIK','POTONG_GAJI','BAYAR_TUNAI')),
      keterangan TEXT,
      keuangan_ref_id TEXT,
      proses_gaji_id TEXT,
      dibuat_oleh TEXT,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      sync_status TEXT DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'conflict')),
      last_synced_at TEXT,
      sync_version INTEGER DEFAULT 1,
      updated_at_server TEXT,
      updated_by_device TEXT DEFAULT 'server',
      change_version INTEGER DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      client_mutation_id TEXT,
      FOREIGN KEY (actor_id) REFERENCES pegawai(id) ON DELETE CASCADE,
      FOREIGN KEY (proses_gaji_id) REFERENCES proses_gaji(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_actor ON pinjaman_karyawan(actor_id);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_jenis ON pinjaman_karyawan(jenis);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_run ON pinjaman_karyawan(proses_gaji_id);
    CREATE INDEX IF NOT EXISTS idx_pinjaman_karyawan_sync ON pinjaman_karyawan(sync_status);
  `);

  serverSqliteColumnsCache.clear();
}

