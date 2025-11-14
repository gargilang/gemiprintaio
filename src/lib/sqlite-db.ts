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

      // Run schema if database is new
      if (!isDatabaseInitialized()) {
        console.log("Initializing database schema...");
        const schema = fs.readFileSync(SCHEMA_FILE, "utf-8");
        db.exec(schema);
        console.log("Database schema initialized successfully");
      }

      isInitializing = false;
      return db;
    } catch (error) {
      isInitializing = false;
      initPromise = null;
      console.error("Failed to initialize database:", error);
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
