/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 *
 * File ini akan dihapus setelah migrasi selesai.
 * Gunakan src/lib/db-unified.ts sebagai gantinya.
 *
 * SQLite operations untuk server-side (API routes).
 * Untuk Tauri, gunakan Rust commands via db-unified.ts
 *
 * @deprecated Use db-unified.ts instead
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { isTauriApp, invokeOrFetch } from "./tauri-helper";

// Database file location
// Will use different paths for Tauri vs Node.js
const DB_DIR = isTauriApp()
  ? "" // Will be set dynamically in Tauri
  : path.join(process.cwd(), "database");

const DB_FILE = isTauriApp()
  ? "" // Will be set dynamically in Tauri
  : path.join(DB_DIR, "gemiprint.db");

const SCHEMA_FILE = isTauriApp()
  ? "" // Schema will be embedded in Tauri
  : path.join(DB_DIR, "sqlite-schema.sql");

const DEFAULTS_FILE = isTauriApp()
  ? ""
  : path.join(DB_DIR, "sqlite-default-values.sql");

let db: Database.Database | null = null;
let isInitializing = false;
let initPromise: Promise<Database.Database | null> | null = null;

/**
 * Initialize SQLite database (SINGLETON - only runs once)
 * Handles both Tauri and Node.js environments
 */
export async function initializeDatabase(): Promise<Database.Database | null> {
  if (isTauriApp()) {
    // In Tauri, database is handled by Rust backend
    // Just return null, actual DB operations will use Tauri commands
    console.log("Running in Tauri mode - database managed by Rust backend");
    return null;
  }

  // Return existing database if already initialized
  if (db) {
    return db;
  }

  // If initialization is in progress, wait for it
  if (isInitializing && initPromise) {
    return initPromise;
  }

  // Start initialization
  isInitializing = true;
  initPromise = (async () => {
    try {
      // Create database directory if it doesn't exist
      if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
      }

      // Initialize database
      db = new Database(DB_FILE, { verbose: console.log });

      // Enable WAL mode for better concurrent access
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");

      // Run schema (and default seed) if the DB has no app tables yet
      if (!isDatabaseInitialized()) {
        console.log("Initializing database schema...");
        const schema = fs.readFileSync(SCHEMA_FILE, "utf-8");
        db.exec(schema);
        applySqliteDefaultValues(db, "new database");
        ensureSyncTables(db);
        console.log("Database schema initialized successfully");
      } else if (db && shouldApplySqliteDefaultValues(db)) {
        applySqliteDefaultValues(
          db,
          "legacy database missing seed (kategori_barang empty)"
        );
        ensureSyncTables(db);
      } else if (db) {
        ensureSyncTables(db);
      }

      isInitializing = false;
      return db;
    } catch (error) {
      isInitializing = false;
      initPromise = null;
      console.error("Failed to initialize database:", error);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ERR_DLOPEN_FAILED"
      ) {
        console.error(
          "better-sqlite3 was built for a different Node version. From the repo root, using the same Node as `npm run dev`, run: npm run rebuild:native"
        );
      }
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Check if database is initialized
 */
function isDatabaseInitialized(): boolean {
  if (!db) return false;

  try {
    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='profil'"
      )
      .get();
    return !!result;
  } catch {
    return false;
  }
}

function shouldApplySqliteDefaultValues(d: InstanceType<typeof Database>): boolean {
  try {
    const row = d
      .prepare("SELECT 1 as n FROM kategori_barang LIMIT 1")
      .get() as { n: number } | undefined;
    if (row) return false;
    return true;
  } catch {
    return false;
  }
}

function applySqliteDefaultValues(d: InstanceType<typeof Database>, reason: string) {
  if (!fs.existsSync(DEFAULTS_FILE)) {
    console.warn("sqlite-default-values.sql not found, skipping seed:", reason);
    return;
  }
  const sql = fs.readFileSync(DEFAULTS_FILE, "utf-8");
  console.log("Applying default seed data (" + reason + ")...");
  d.exec(sql);
  console.log("Default seed data applied");
}

function ensureSyncTables(d: InstanceType<typeof Database>) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
      data TEXT,
      synced INTEGER DEFAULT 0,
      sync_attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      table_name TEXT PRIMARY KEY,
      pending_changes INTEGER DEFAULT 0,
      last_sync_at TEXT,
      last_sync_status TEXT
    );
  `);

  // Handle legacy sync_queue/sync_metadata schemas by adding missing columns.
  const syncQueueCols = (d
    .prepare("PRAGMA table_info(sync_queue)")
    .all() as Array<{ name: string }>).map((c) => c.name);

  if (!syncQueueCols.includes("synced")) {
    d.exec("ALTER TABLE sync_queue ADD COLUMN synced INTEGER DEFAULT 0");
  }
  if (!syncQueueCols.includes("sync_attempts")) {
    d.exec("ALTER TABLE sync_queue ADD COLUMN sync_attempts INTEGER DEFAULT 0");
  }
  if (!syncQueueCols.includes("last_error")) {
    d.exec("ALTER TABLE sync_queue ADD COLUMN last_error TEXT");
  }
  if (!syncQueueCols.includes("created_at")) {
    d.exec(
      "ALTER TABLE sync_queue ADD COLUMN created_at TEXT DEFAULT (datetime('now'))"
    );
  }

  const syncMetaCols = (d
    .prepare("PRAGMA table_info(sync_metadata)")
    .all() as Array<{ name: string }>).map((c) => c.name);
  if (!syncMetaCols.includes("pending_changes")) {
    d.exec("ALTER TABLE sync_metadata ADD COLUMN pending_changes INTEGER DEFAULT 0");
  }
  if (!syncMetaCols.includes("last_sync_at")) {
    d.exec("ALTER TABLE sync_metadata ADD COLUMN last_sync_at TEXT");
  }
  if (!syncMetaCols.includes("last_sync_status")) {
    d.exec("ALTER TABLE sync_metadata ADD COLUMN last_sync_status TEXT");
  }

  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
      ON sync_queue(synced, sync_attempts, created_at);
  `);

  ensureSyncColumnsV2(d);
}

function ensureSyncColumnsV2(d: InstanceType<typeof Database>) {
  const syncTables = [
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
  ];

  for (const tableName of syncTables) {
    const tableExists = d
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1")
      .get(tableName);
    if (!tableExists) continue;

    const cols = (d
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>).map((c) => c.name);

    if (!cols.includes("updated_at_server")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN updated_at_server TEXT`);
      const fallbackTimestampExpr = cols.includes("diperbarui_pada")
        ? "diperbarui_pada"
        : cols.includes("dibuat_pada")
          ? "dibuat_pada"
          : "datetime('now')";
      d.exec(
        `UPDATE ${tableName} SET updated_at_server = COALESCE(updated_at_server, ${fallbackTimestampExpr})`
      );
    }
    if (!cols.includes("updated_by_device")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN updated_by_device TEXT DEFAULT 'server'`);
    }
    if (!cols.includes("change_version")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN change_version INTEGER DEFAULT 1`);
    }
    if (!cols.includes("is_deleted")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    }
    if (!cols.includes("deleted_at")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN deleted_at TEXT`);
    }
    if (!cols.includes("client_mutation_id")) {
      d.exec(`ALTER TABLE ${tableName} ADD COLUMN client_mutation_id TEXT`);
    }

    d.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_updated_at_server ON ${tableName}(updated_at_server)`
    );
    d.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_change_version ON ${tableName}(change_version)`
    );
    d.exec(
      `CREATE INDEX IF NOT EXISTS idx_${tableName}_is_deleted ON ${tableName}(is_deleted)`
    );
  }

  d.exec(`
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

    CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record
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
}

/**
 * Get database instance (synchronous)
 * Ensures database is initialized before use
 * In Tauri mode, throws error (use Tauri commands instead)
 * In Node.js mode, returns cached db or throws error if not initialized
 */
export function getDatabase(): Database.Database {
  if (isTauriApp()) {
    throw new Error(
      "Database not available in Tauri mode. Use Tauri commands."
    );
  }

  if (!db) {
    throw new Error(
      "Database not initialized. This should not happen in API routes."
    );
  }
  return db;
}

/**
 * Get database instance (async version for API routes)
 * Automatically initializes if needed
 */
export async function getDatabaseAsync(): Promise<Database.Database> {
  if (isTauriApp()) {
    throw new Error(
      "Database not available in Tauri mode. Use Tauri commands."
    );
  }

  if (!db) {
    await initializeDatabase();
  }

  if (!db) {
    throw new Error("Failed to initialize database");
  }

  return db;
}

/**
 * Generate UUID for new records
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Generic query helper
 * Automatically routes to Tauri or Node.js implementation
 */
export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  if (isTauriApp()) {
    // Use Tauri command
    return (await invokeOrFetch("db_query", { sql, params })) as T[];
  }

  // Node.js mode
  const db = getDatabase();
  if (!db) throw new Error("Database not available");
  return db.prepare(sql).all(...params) as T[];
}

/**
 * Generic query helper for single row
 */
export function queryOne<T = any>(
  sql: string,
  params: any[] = []
): T | undefined {
  const db = getDatabase();
  return db.prepare(sql).get(...params) as T | undefined;
}

/**
 * Generic insert helper
 */
export function insert(table: string, data: Record<string, any>): string {
  const db = getDatabase();
  const id = data.id || generateId();

  const columns = Object.keys(data);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((col) => data[col]);

  const sql = `INSERT INTO ${table} (${columns.join(
    ", "
  )}) VALUES (${placeholders})`;

  try {
    db.prepare(sql).run(...values);

    // Add to sync queue
    addToSyncQueue(table, id, "INSERT", data);

    return id;
  } catch (error: any) {
    console.error(`Error inserting into ${table}:`, error);
    throw error;
  }
}

/**
 * Generic update helper
 */
export function update(
  table: string,
  id: string,
  data: Record<string, any>
): void {
  const db = getDatabase();

  const updates = Object.keys(data)
    .filter((key) => key !== "id")
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = Object.keys(data)
    .filter((key) => key !== "id")
    .map((key) => data[key]);

  const sql = `UPDATE ${table} SET ${updates}, updated_at = datetime('now') WHERE id = ?`;

  try {
    db.prepare(sql).run(...values, id);

    // Add to sync queue
    addToSyncQueue(table, id, "UPDATE", data);
  } catch (error: any) {
    console.error(`Error updating ${table}:`, error);
    throw error;
  }
}

/**
 * Generic delete helper
 */
export function deleteRecord(table: string, id: string): void {
  const db = getDatabase();

  try {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);

    // Add to sync queue
    addToSyncQueue(table, id, "DELETE", null);
  } catch (error: any) {
    console.error(`Error deleting from ${table}:`, error);
    throw error;
  }
}

/**
 * Add operation to sync queue
 */
export function addToSyncQueue(
  tableName: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  data: Record<string, any> | null
): void {
  const db = getDatabase();

  const queueId = generateId();
  const dataJson = data ? JSON.stringify(data) : null;

  const sql = `
    INSERT INTO sync_queue (id, table_name, record_id, operation, data, synced, sync_attempts)
    VALUES (?, ?, ?, ?, ?, 0, 0)
  `;

  db.prepare(sql).run(queueId, tableName, recordId, operation, dataJson);

  db.prepare(
    `
    INSERT OR IGNORE INTO sync_metadata (table_name, pending_changes)
    VALUES (?, 0)
  `
  ).run(tableName);

  // Update pending changes count
  db.prepare(
    `
    UPDATE sync_metadata 
    SET pending_changes = pending_changes + 1 
    WHERE table_name = ?
  `
  ).run(tableName);
}

/**
 * Get pending sync operations
 */
export function getPendingSyncOperations(limit: number = 100): any[] {
  const db = getDatabase();

  return db
    .prepare(
      `
    SELECT * FROM sync_queue 
    WHERE synced = 0 AND sync_attempts < 5
    ORDER BY created_at ASC
    LIMIT ?
  `
    )
    .all(limit);
}

/**
 * Mark sync operation as completed
 */
export function markSyncCompleted(queueId: string, tableName: string): void {
  const db = getDatabase();

  db.prepare(
    `
    UPDATE sync_queue 
    SET synced = 1, last_error = NULL 
    WHERE id = ?
  `
  ).run(queueId);

  db.prepare(
    `
    UPDATE sync_metadata 
    SET pending_changes = MAX(0, pending_changes - 1),
        last_sync_at = datetime('now'),
        last_sync_status = 'success'
    WHERE table_name = ?
  `
  ).run(tableName);
}

/**
 * Mark sync operation as failed
 */
export function markSyncFailed(queueId: string, error: string): void {
  const db = getDatabase();

  db.prepare(
    `
    UPDATE sync_queue 
    SET sync_attempts = sync_attempts + 1,
        last_error = ?
    WHERE id = ?
  `
  ).run(error, queueId);
}

/**
 * Get sync metadata for all tables
 */
export function getSyncMetadata(): any[] {
  const db = getDatabase();
  return db.prepare("SELECT * FROM sync_metadata").all();
}

/**
 * Get total pending changes
 */
export function getTotalPendingChanges(): number {
  const db = getDatabase();
  const result = db
    .prepare("SELECT SUM(pending_changes) as total FROM sync_metadata")
    .get() as any;
  return result?.total || 0;
}

// Initialize database on server startup (not on every import)
// This runs once when Next.js server starts
if (typeof window === "undefined" && !isTauriApp()) {
  // Only initialize on server-side, run in background
  initializeDatabase().catch((error) => {
    console.error("Failed to initialize database on startup:", error);
  });
}
