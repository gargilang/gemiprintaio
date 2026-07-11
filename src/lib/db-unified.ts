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

// SQLite helpers (extracted)
export { getServerSQLite, SYNC_V2_TABLES } from "./db-sqlite";
import {
  getServerSQLite,
  serverSqliteColumnsCache,
  SYNC_V2_TABLES,
} from "./db-sqlite";
import { hashPayload } from "./payload-hash-util";

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

// normalizeRecord dipindah ke modul murni `normalize-record.ts` (D-I2) supaya
// deteksi boolean memakai whitelist yang aman + bisa di-unit-test.
import { normalizeRecord } from "./normalize-record";
import { supabaseTargetLabel } from "./supabase-target";
export { normalizeRecord };

/**
 * Generate consistent UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Validasi identifier SQL (nama tabel/kolom) sebelum interpolasi ke string SQL.
 * db-unified menginterpolasi `table` dan nama kolom (where/orderBy) langsung ke
 * SQL — aman selama caller pakai literal, tapi whitelist runtime ini mencegah
 * regresi membuka SQL injection. Hanya huruf kecil, angka, dan underscore;
 * harus diawali huruf/underscore.
 */
function assertSafeIdentifier(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Identifier SQL tidak valid: ${name}`);
  }
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
  opts: { keepClientMutationId?: boolean } = {},
): Record<string, any> {
  const now = getCurrentTimestamp();
  const next = { ...data };
  next.updated_at_server = now;
  next.updated_by_device = getDeviceId();
  next.change_version =
    typeof next.change_version === "number" ? next.change_version + 1 : 1;
  if (!opts.keepClientMutationId) {
    next.client_mutation_id =
      next.client_mutation_id ||
      `${next.updated_by_device}-${crypto.randomUUID()}`;
  }
  if (typeof next.is_deleted === "undefined") next.is_deleted = 0;
  return next;
}

/**
 * Server-side SQLite mirror gating.
 *
 * SQLite is meaningful in two scenarios only:
 *   1. Tauri desktop builds — SQLite is the primary store, Supabase is sync.
 *   2. Tauri-bundled standalone server (sidecar inside the desktop app),
 *      identified by TAURI=true at build time.
 *
 * In every other environment (Vercel serverless, plain `next dev`,
 * production Node server) we skip SQLite entirely:
 *   - Vercel has no persistent filesystem — writes would silently fail.
 *   - Local `next dev` runs the developer's machine; trying to mirror
 *     into ./database/gemiprint.db introduces FK constraint failures
 *     when the local file lags behind Supabase, and adds zero value
 *     since Supabase is the source of truth for web users anyway.
 *
 * Override:
 *   - `GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR=1` forces it on (advanced).
 *   - `GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR=1` forces it off (legacy flag).
 */
function skipServerSqliteMirror(): boolean {
  // Legacy explicit-off flag wins.
  if (process.env.GEMIPRINT_SKIP_SERVER_SQLITE_MIRROR === "1") return true;
  // Explicit-on opt-in.
  if (process.env.GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR === "1") return false;
  // Tauri sidecar build: the bundled standalone server runs inside the
  // desktop app, so SQLite is meaningful and writable.
  if (process.env.TAURI === "true" || process.env.TAURI === "1") return false;
  // Default: skip on every other server (Vercel, plain Node, next dev, etc.).
  return true;
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

// SQLite section moved to db-sqlite.ts

async function getServerSQLiteTableColumns(
  table: string,
): Promise<Set<string>> {
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

/**
 * Server-side Supabase column introspection cache.
 *
 * Used when local SQLite is disabled (Vercel / web dev) and we still need
 * to filter the payload to columns that actually exist in the cloud
 * schema. Strategy: sample one row from the table; PostgREST returns
 * every column even when the row's value is null. If the table happens
 * to be empty the sample returns nothing — caller falls back to sending
 * the unfiltered payload, which Postgres will reject with a clear error.
 */
const serverSupabaseColumnsCache = new Map<string, Set<string>>();

async function getServerSupabaseTableColumns(
  table: string,
): Promise<Set<string>> {
  const cached = serverSupabaseColumnsCache.get(table);
  if (cached) return cached;

  const supabase = getServerSupabaseClient();
  if (!supabase) return new Set();

  try {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      // Table missing from cloud schema or RLS denied — return empty so
      // the caller falls back to the unfiltered path.
      return new Set();
    }
    if (data && data.length > 0) {
      const cols = new Set(Object.keys(data[0] as Record<string, unknown>));
      serverSupabaseColumnsCache.set(table, cols);
      return cols;
    }
  } catch {
    // Network/auth issue — return empty.
  }

  return new Set();
}

/**
 * Get the set of known column names for a table from whichever store has
 * usable schema info. Tries SQLite first (cheapest, available in Tauri /
 * server-with-mirror) and falls back to a live Supabase row sample.
 */
async function getKnownTableColumns(table: string): Promise<Set<string>> {
  const sqliteCols = await getServerSQLiteTableColumns(table);
  if (sqliteCols.size > 0) return sqliteCols;
  return await getServerSupabaseTableColumns(table);
}

function getPostgrestMissingColumn(error: unknown): string | null {
  const maybeError = error as { code?: string; message?: string } | null;
  if (maybeError?.code !== "PGRST204" || !maybeError.message) return null;

  const match = maybeError.message.match(/'([^']+)'\s+column/);
  return match?.[1] ?? null;
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
    console.info("✅ Server-side Supabase connected");
  }

  return serverSupabaseClient;
}

/**
 * Apakah `db.transaction()` benar-benar atomik di runtime saat ini?
 * - Tauri: ya (transaksi SQLite nyata).
 * - Server dengan mirror SQLite aktif: ya.
 * - Server Supabase-only (Vercel / next dev default): TIDAK — operasi
 *   dijalankan berurutan tanpa rollback lintas-statement.
 *
 * Caller composite mutation (createSale dll) memakai ini untuk memutuskan
 * apakah perlu compensating cleanup manual saat ada kegagalan di tengah.
 */
export async function isCompositeTransactionAtomic(): Promise<boolean> {
  if (isTauriApp()) return true;
  if (isServerSide()) {
    const sqlite = await getServerSQLite();
    return !!sqlite;
  }
  return false;
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
      console.info(
        `🌐 Supabase online - using ${supabaseTargetLabel()} database`,
      );
    } else {
      if (error) {
        console.warn("📴 Supabase profil check failed:", error.message, error);
      }
      console.info("📴 Supabase offline - using local SQLite");
    }

    return serverOnlineStatus;
  } catch (err) {
    console.info("📴 Supabase connection failed - using local SQLite");
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
    console.debug(`📝 Queued offline operation:`, newOp);
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
    options: QueryOptions = {},
  ): Promise<QueryResult<T>> {
    try {
      // Tauri: Always use SQLite via Rust
      if (isTauriApp()) {
        return await this.queryTauri<T>(table, options);
      }

      // Server-side: Try Supabase first, fallback to SQLite when available.
      if (isServerSide()) {
        const supabaseAvailable = await isServerSupabaseAvailable();
        if (supabaseAvailable) {
          const result = await this.queryServerSupabase<T>(table, options);
          if (!result.error) {
            return result;
          }
          // Supabase-only mode: surface error instead of trying to read
          // from a non-existent SQLite mirror.
          if (skipServerSqliteMirror()) {
            console.error(
              `❌ Supabase query failed on ${table}:`,
              result.error,
            );
            return result;
          }
          console.warn(`⚠️ Supabase query failed, falling back to SQLite`);
        }
        if (skipServerSqliteMirror()) {
          // Supabase unavailable AND no local mirror — return empty.
          return { data: [], error: null };
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
    options: QueryOptions = {},
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
    data: Record<string, any>,
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

      // Server-side: Try Supabase first, fallback to SQLite when available.
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
          // Supabase write failed AND we're in Supabase-only mode (no
          // local SQLite mirror). Surface the actual Supabase error
          // instead of trying to write to a mirror that doesn't exist.
          if (skipServerSqliteMirror()) {
            console.error(
              `❌ Supabase insert failed on ${table}:`,
              result.error,
            );
            return result;
          }
          console.warn(`⚠️ Supabase insert failed, falling back to SQLite`);
        }
        // Offline: only queue if SQLite mirror exists. In Supabase-only
        // mode there's no local store to queue into — return an error.
        if (!supabaseAvailable) {
          if (skipServerSqliteMirror()) {
            return {
              data: null,
              error: new Error(
                "Supabase tidak tersedia dan SQLite mirror dinonaktifkan",
              ),
            };
          }
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
    data: Record<string, any>,
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

      // Server-side: Try Supabase first, fallback to SQLite when available.
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
          // Supabase-only mode: surface the actual error instead of
          // attempting a non-existent SQLite fallback.
          if (skipServerSqliteMirror()) {
            console.error(
              `❌ Supabase update failed on ${table}:`,
              result.error,
            );
            return result;
          }
          console.warn(`⚠️ Supabase update failed, falling back to SQLite`);
        }
        if (!supabaseAvailable) {
          if (skipServerSqliteMirror()) {
            return {
              data: null,
              error: new Error(
                "Supabase tidak tersedia dan SQLite mirror dinonaktifkan",
              ),
            };
          }
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

      // Server-side: Try Supabase first, fallback to SQLite when available.
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
          if (skipServerSqliteMirror()) {
            console.error(
              `❌ Supabase delete failed on ${table}:`,
              result.error,
            );
            return result;
          }
          console.warn(`⚠️ Supabase delete failed, falling back to SQLite`);
        }
        if (!supabaseAvailable) {
          if (skipServerSqliteMirror()) {
            return {
              data: null,
              error: new Error(
                "Supabase tidak tersedia dan SQLite mirror dinonaktifkan",
              ),
            };
          }
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
    options: QueryOptions,
  ): Promise<QueryResult<T>> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    assertSafeIdentifier(table);
    let sql = `SELECT ${options.select || "*"} FROM ${table}`;
    const params: any[] = [];

    // Build WHERE clause
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.entries(options.where).map(([key, value]) => {
        assertSafeIdentifier(key);
        if (value === null) {
          return `${key} IS NULL`;
        }
        if (Array.isArray(value)) {
          // Batch lookup: WHERE key IN (?, ?, ...). Empty array → 0=1 (no rows).
          // Catatan: SQLite membatasi jumlah bind variable (SQLITE_MAX_VARIABLE_NUMBER,
          // ~999). Pemanggil yang membatch >999 id perlu memecah (chunk) lebih dulu.
          if (value.length === 0) return "0 = 1";
          const placeholders = value.map(() => "?").join(", ");
          for (const v of value) params.push(v);
          return `${key} IN (${placeholders})`;
        }
        params.push(value);
        return `${key} = ?`;
      });
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    // Add ORDER BY
    if (options.orderBy) {
      assertSafeIdentifier(options.orderBy.column);
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
    data: Record<string, any>,
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    assertSafeIdentifier(table);
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
      ", ",
    )}) VALUES (${placeholders})`;

    try {
      const stmt = db.prepare(sql);
      const info = stmt.run(...values);
      if (info.changes === 0) {
        // Row di-IGNORE karena konflik UNIQUE/PK. Ini bisa berarti:
        //   (a) retry idempoten yang sah (Supabase sudah tulis, mirror ulang), atau
        //   (b) BUG: ID bentrok (race generateId / data impor buruk) sehingga
        //       data BARU diam-diam tidak tertulis (D-I4).
        // Kita tidak bisa throw karena kasus (a) sah, tapi JANGAN diam — log
        // warning supaya konflik (b) terlihat/greppable, bukan hilang senyap.
        console.warn(
          `[insertServerSQLite] INSERT OR IGNORE: 0 baris berubah untuk ${table} id=${data.id}. ` +
            `Data baru TIDAK ditulis (kemungkinan retry idempoten ATAU konflik PK). Periksa bila tak terduga.`,
        );
        // Kembalikan ID baris yang ada supaya referensi FK downstream tetap valid.
        try {
          const existing = db
            .prepare(`SELECT id FROM ${table} WHERE id = ?`)
            .get(data.id);
          if (existing)
            return { data: { id: (existing as any).id }, error: null };
          // id not found — try by participant_code if available (finance_metric_mappings)
          if (data.participant_code) {
            const byCode = db
              .prepare(`SELECT id FROM ${table} WHERE participant_code = ?`)
              .get(data.participant_code);
            if (byCode)
              return { data: { id: (byCode as any).id }, error: null };
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
    data: Record<string, any>,
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    const tableColumns = await getServerSQLiteTableColumns(table);
    assertSafeIdentifier(table);
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
    id: string,
  ): Promise<MutationResult> {
    const db = await getServerSQLite();
    if (!db) {
      return { data: null, error: new Error("Server SQLite not available") };
    }

    assertSafeIdentifier(table);
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
    options: QueryOptions,
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
        } else if (Array.isArray(value)) {
          // Batch lookup: WHERE key IN (...). Empty array → matches nothing.
          query = query.in(key, value);
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
        options.offset + (options.limit || 10) - 1,
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
    data: Record<string, any>,
  ): Promise<MutationResult> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    // Saring payload ke kolom yang ada di skema aktual. Coba introspeksi
    // SQLite lebih dulu (gratis), lalu fallback ke sampel baris Supabase.
    // Ini mencegah galat "could not find column X in schema cache" saat
    // mirror SQLite dinonaktifkan (Vercel / web dev).
    const tableColumns = await getKnownTableColumns(table);
    let payload =
      tableColumns.size > 0
        ? Object.fromEntries(
            Object.entries(data).filter(([key]) => tableColumns.has(key)),
          )
        : data;

    if (!(await this.registerMutationIfNeeded(table, data.id, payload))) {
      return { data: { id: data.id }, error: null };
    }

    const droppedColumns: string[] = [];
    const maxSchemaCacheRetries = Math.max(Object.keys(payload).length + 1, 5);
    for (let attempt = 0; attempt < maxSchemaCacheRetries; attempt++) {
      const { data: inserted, error } = await supabase
        .from(table)
        .upsert(payload, { onConflict: "id" })
        .select("id")
        .single();

      if (!error) {
        if (droppedColumns.length > 0) {
          console.warn(
            `Server Supabase insert on ${table} skipped columns missing from schema: ${droppedColumns.join(", ")}`,
          );
        }
        return { data: { id: inserted.id }, error: null };
      }

      const missingColumn = getPostgrestMissingColumn(error);
      if (missingColumn && Object.hasOwn(payload, missingColumn)) {
        droppedColumns.push(missingColumn);
        serverSupabaseColumnsCache.get(table)?.delete(missingColumn);
        const { [missingColumn]: _dropped, ...nextPayload } = payload;
        payload = nextPayload;
        continue;
      }

      console.error(`Server Supabase insert error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: null,
      error: new Error(
        `Supabase schema cache rejected insert on ${table} after dropping columns: ${droppedColumns.join(", ")}`,
      ),
    };
  }

  private async updateServerSupabase(
    table: string,
    id: string,
    data: Record<string, any>,
  ): Promise<MutationResult> {
    const supabase = getServerSupabaseClient();
    if (!supabase) {
      return { data: null, error: new Error("Server Supabase not configured") };
    }

    // Filter payload to columns that exist in the actual schema. See
    // insertServerSupabase for rationale.
    const tableColumns = await getKnownTableColumns(table);
    let payload =
      tableColumns.size > 0
        ? Object.fromEntries(
            Object.entries(data).filter(([key]) => tableColumns.has(key)),
          )
        : data;

    if (!(await this.registerMutationIfNeeded(table, id, payload))) {
      return { data: { id }, error: null };
    }

    const droppedColumns: string[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase.from(table).update(payload).eq("id", id);

      if (!error) {
        if (droppedColumns.length > 0) {
          console.warn(
            `Server Supabase update on ${table} skipped columns missing from schema: ${droppedColumns.join(", ")}`,
          );
        }
        return { data: { id }, error: null };
      }

      const missingColumn = getPostgrestMissingColumn(error);
      if (missingColumn && Object.hasOwn(payload, missingColumn)) {
        droppedColumns.push(missingColumn);
        serverSupabaseColumnsCache.get(table)?.delete(missingColumn);
        const { [missingColumn]: _dropped, ...nextPayload } = payload;
        payload = nextPayload;
        continue;
      }

      console.error(`Server Supabase update error on ${table}:`, error);
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: null,
      error: new Error(
        `Supabase schema cache rejected update on ${table} after dropping columns: ${droppedColumns.join(", ")}`,
      ),
    };
  }

  private async deleteServerSupabase(
    table: string,
    id: string,
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
    data: Record<string, any>,
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
      payload_hash: hashPayload(data),
    });
    return true;
  }

  // === Tauri SQLite Operations ===

  private async queryTauri<T>(
    table: string,
    options: QueryOptions,
  ): Promise<QueryResult<T>> {
    assertSafeIdentifier(table);
    let sql = `SELECT ${options.select || "*"} FROM ${table}`;
    const params: any[] = [];

    // Build WHERE clause
    if (options.where && Object.keys(options.where).length > 0) {
      const conditions = Object.entries(options.where).map(([key, value]) => {
        assertSafeIdentifier(key);
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
      assertSafeIdentifier(options.orderBy.column);
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
    data: Record<string, any>,
  ): Promise<MutationResult> {
    assertSafeIdentifier(table);
    const columns = Object.keys(data);
    columns.forEach((c) => assertSafeIdentifier(c));
    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");

    const sql = `INSERT INTO ${table} (${columns.join(
      ", ",
    )}) VALUES (${placeholders})`;

    await invoke("db_execute", { sql, params: values });
    return { data: { id: data.id }, error: null };
  }

  private async updateTauri(
    table: string,
    id: string,
    data: Record<string, any>,
  ): Promise<MutationResult> {
    assertSafeIdentifier(table);
    const sets = Object.keys(data).map((key) => {
      assertSafeIdentifier(key);
      return `${key} = ?`;
    });
    const values = [...Object.values(data), id];

    const sql = `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`;

    await invoke("db_execute", { sql, params: values });
    return { data: { id }, error: null };
  }

  private async deleteTauri(
    table: string,
    id: string,
  ): Promise<MutationResult> {
    assertSafeIdentifier(table);
    const sql = `DELETE FROM ${table} WHERE id = ?`;

    await invoke("db_execute", { sql, params: [id] });
    return { data: { id }, error: null };
  }

  // === Supabase Operations ===

  private async querySupabase<T>(
    table: string,
    options: QueryOptions,
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
        options.offset + (options.limit || 10) - 1,
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
    data: Record<string, any>,
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
    data: Record<string, any>,
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
    id: string,
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
        }),
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
    recordId?: string,
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
      db.prepare("PRAGMA table_info(sync_queue)").all() as Array<{
        name: string;
      }>
    ).map((c) => c.name);

    if (!columns.includes("dibuat_pada")) {
      db.exec("ALTER TABLE sync_queue ADD COLUMN dibuat_pada TEXT");
      if (columns.includes("created_at")) {
        db.exec(
          "UPDATE sync_queue SET dibuat_pada = COALESCE(dibuat_pada, created_at, datetime('now'))",
        );
      } else {
        db.exec(
          "UPDATE sync_queue SET dibuat_pada = COALESCE(dibuat_pada, datetime('now'))",
        );
      }
    }

    if (!columns.includes("status")) {
      db.exec(
        "ALTER TABLE sync_queue ADD COLUMN status TEXT DEFAULT 'pending'",
      );
      if (columns.includes("synced_at")) {
        db.exec(
          "UPDATE sync_queue SET status = CASE WHEN synced_at IS NULL THEN 'pending' ELSE 'completed' END WHERE status IS NULL",
        );
      } else {
        db.exec("UPDATE sync_queue SET status = COALESCE(status, 'pending')");
      }
    }

    // Migrasi: fondasi notifikasi terpusat.
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifikasi (
        id TEXT PRIMARY KEY,
        tipe TEXT NOT NULL DEFAULT 'info' CHECK(tipe IN ('success', 'error', 'info', 'warning')),
        kategori TEXT NOT NULL DEFAULT 'toast' CHECK(kategori IN ('toast', 'bank', 'sistem')),
        judul TEXT,
        pesan TEXT NOT NULL,
        sumber_path TEXT,
        sumber_judul TEXT,
        ref_tipe TEXT,
        ref_id TEXT,
        metadata_json TEXT,
        dibuat_oleh TEXT REFERENCES profil(id) ON DELETE SET NULL,
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
        client_mutation_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notifikasi_dibuat_pada ON notifikasi(dibuat_pada DESC);
      CREATE INDEX IF NOT EXISTS idx_notifikasi_kategori_tipe ON notifikasi(kategori, tipe, dibuat_pada DESC);
      CREATE INDEX IF NOT EXISTS idx_notifikasi_ref ON notifikasi(ref_tipe, ref_id);

      CREATE TABLE IF NOT EXISTS notifikasi_pengguna (
        id TEXT PRIMARY KEY,
        notifikasi_id TEXT NOT NULL REFERENCES notifikasi(id) ON DELETE CASCADE,
        pengguna_id TEXT NOT NULL REFERENCES profil(id) ON DELETE CASCADE,
        dibaca_status INTEGER NOT NULL DEFAULT 0,
        dibaca_pada TEXT,
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
        CONSTRAINT notifikasi_pengguna_unique UNIQUE (notifikasi_id, pengguna_id)
      );
      CREATE INDEX IF NOT EXISTS idx_notifikasi_pengguna_user ON notifikasi_pengguna(pengguna_id, dibaca_status, dibuat_pada DESC);
      CREATE INDEX IF NOT EXISTS idx_notifikasi_pengguna_notifikasi ON notifikasi_pengguna(notifikasi_id);
    `);

    // Migrasi: pengaturan_toko format tanggal nomor urut.
    {
      const exists = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name = 'pengaturan_toko' LIMIT 1",
        )
        .get();
      if (exists) {
        const cols = (
          db.prepare("PRAGMA table_info(pengaturan_toko)").all() as Array<{
            name: string;
          }>
        ).map((c) => c.name);
        if (!cols.includes("inv_date_format")) {
          db.exec(
            "ALTER TABLE pengaturan_toko ADD COLUMN inv_date_format TEXT NOT NULL DEFAULT 'YYYYMMDD' CHECK(inv_date_format IN ('YYYYMMDD', 'YYMMDD', 'DDMMYYYY', 'DDMMYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMM', 'YYMM', 'MMYYYY', 'MMYY', 'DDMM', 'MMDD'))",
          );
        }
        if (!cols.includes("spk_date_format")) {
          db.exec(
            "ALTER TABLE pengaturan_toko ADD COLUMN spk_date_format TEXT NOT NULL DEFAULT 'YYYYMMDD' CHECK(spk_date_format IN ('YYYYMMDD', 'YYMMDD', 'DDMMYYYY', 'DDMMYY', 'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYYMM', 'YYMM', 'MMYYYY', 'MMYY', 'DDMM', 'MMDD'))",
          );
        }
      }
    }

    // Migrasi: barang.muncul_di_pos_status
    {
      const cols = (
        db.prepare("PRAGMA table_info(barang)").all() as Array<{ name: string }>
      ).map((c) => c.name);
      if (!cols.includes("muncul_di_pos_status")) {
        db.exec(
          "ALTER TABLE barang ADD COLUMN muncul_di_pos_status INTEGER NOT NULL DEFAULT 1",
        );
      }
    }

    // Migrasi: harga_barang_satuan.nama_produk_jual
    {
      const cols = (
        db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      if (!cols.includes("nama_produk_jual")) {
        db.exec(
          "ALTER TABLE harga_barang_satuan ADD COLUMN nama_produk_jual TEXT",
        );
      }
    }

    // Migrasi: biaya_tambahan_penjualan tautan item + metadata sinkronisasi.
    {
      const cols = new Set(
        (
          db
            .prepare("PRAGMA table_info(biaya_tambahan_penjualan)")
            .all() as Array<{ name: string }>
        ).map((c) => c.name),
      );
      const addColumn = (name: string, sql: string) => {
        if (!cols.has(name)) {
          db.exec(sql);
          cols.add(name);
        }
      };

      addColumn(
        "item_penjualan_id",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN item_penjualan_id TEXT",
      );
      addColumn(
        "modal",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN modal REAL NOT NULL DEFAULT 0",
      );
      addColumn(
        "diperbarui_pada",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN diperbarui_pada TEXT",
      );
      addColumn(
        "updated_at_server",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN updated_at_server TEXT",
      );
      addColumn(
        "updated_by_device",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN updated_by_device TEXT DEFAULT 'server'",
      );
      addColumn(
        "change_version",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN change_version INTEGER DEFAULT 1",
      );
      addColumn(
        "is_deleted",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0",
      );
      addColumn(
        "deleted_at",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN deleted_at TEXT",
      );
      addColumn(
        "client_mutation_id",
        "ALTER TABLE biaya_tambahan_penjualan ADD COLUMN client_mutation_id TEXT",
      );
    }

    // Migrasi (20260707000003): item_penjualan kolom pending + katalog_maklon_id.
    {
      const cols = (
        db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      if (!cols.includes("pending_vendor_hpp")) {
        db.exec(
          "ALTER TABLE item_penjualan ADD COLUMN pending_vendor_hpp INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!cols.includes("katalog_maklon_id")) {
        db.exec("ALTER TABLE item_penjualan ADD COLUMN katalog_maklon_id TEXT");
      }
      if (!cols.includes("nama_produk_jual")) {
        db.exec("ALTER TABLE item_penjualan ADD COLUMN nama_produk_jual TEXT");
      }
    }

    // Migrasi (20260707000003): katalog_maklon kolom populer_status + kategori_id.
    {
      const cols = (
        db.prepare("PRAGMA table_info(katalog_maklon)").all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      if (!cols.includes("populer_status")) {
        db.exec(
          "ALTER TABLE katalog_maklon ADD COLUMN populer_status INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!cols.includes("kategori_id")) {
        db.exec("ALTER TABLE katalog_maklon ADD COLUMN kategori_id TEXT");
      }
      // Migrasi (20260712120000): maklon berdimensi (harga per m²).
      if (!cols.includes("butuh_dimensi_status")) {
        db.exec(
          "ALTER TABLE katalog_maklon ADD COLUMN butuh_dimensi_status INTEGER NOT NULL DEFAULT 0",
        );
      }
      // Migrasi data free-text kategori -> kategori_id (selaras dengan migrasi Supabase).
      // Idempoten: hanya isi jika kategori_id masih NULL dan kategori cocok nama kategori_barang.
      try {
        db.exec(
          `UPDATE katalog_maklon SET kategori_id = (
             SELECT kb.id FROM kategori_barang kb WHERE kb.nama = katalog_maklon.kategori
           ) WHERE kategori_id IS NULL AND kategori IS NOT NULL`,
        );
      } catch (_e) {
        // Toleransi: kategori_barang mungkin belum ada di fresh install.
      }
    }

    // Migrasi (20260707000003): harga_barang_satuan kolom populer_status.
    {
      const cols = (
        db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      if (!cols.includes("populer_status")) {
        db.exec(
          "ALTER TABLE harga_barang_satuan ADD COLUMN populer_status INTEGER NOT NULL DEFAULT 0",
        );
      }
    }

    // Migrasi (20260707000003): lebarkan CHECK metode_bayar_vendor di item_penjualan
    // supaya menerima 'TRANSFER'. SQLite tidak bisa DROP CONSTRAINT → rebuild tabel.
    // Idempoten: setelah rebuild, sql LIKE tidak match lagi → skip.
    {
      const oldCheck = db
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type='table' AND name='item_penjualan'
           AND sql LIKE '%metode_bayar_vendor IN (''CASH'',''NET30''))%' AND sql NOT LIKE '%TRANSFER%' LIMIT 1`,
        )
        .get();
      if (oldCheck) {
        const colInfo = (
          db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).filter((c) => !c.pk);
        const pkCol = (
          db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).find((c) => c.pk);
        const colDefs = [
          pkCol
            ? `"${pkCol.name}" ${pkCol.type || "TEXT"} PRIMARY KEY`
            : '"id" TEXT PRIMARY KEY',
          ...colInfo.map((c) => {
            // Injeksi CHECK baru untuk kolom metode_bayar_vendor (lebarkan ke TRANSFER).
            if (c.name === "metode_bayar_vendor") {
              return `"metode_bayar_vendor" TEXT CHECK(metode_bayar_vendor IS NULL OR metode_bayar_vendor IN ('CASH','NET30','TRANSFER'))`;
            }
            let sql = `"${c.name}" ${c.type || "TEXT"}`;
            if (c.notnull) sql += " NOT NULL";
            if (c.dflt_value != null) {
              // Literal (angka/string/true/false/null) langsung; ekspresi (mis. datetime('now')) bungkus parens.
              const dv = c.dflt_value;
              const isLiteral =
                /^[-'0-9]/.test(dv) || /^(true|false|null)$/i.test(dv);
              sql += ` DEFAULT ${isLiteral ? dv : `(${dv})`}`;
            }
            return sql;
          }),
          "FOREIGN KEY (penjualan_id) REFERENCES penjualan(id) ON DELETE CASCADE",
          "FOREIGN KEY (barang_id) REFERENCES barang(id)",
          "FOREIGN KEY (harga_satuan_id) REFERENCES harga_barang_satuan(id)",
          "FOREIGN KEY (vendor_subkontrak_id) REFERENCES vendor(id) ON DELETE SET NULL",
          "FOREIGN KEY (pembelian_id_terkait) REFERENCES pembelian(id) ON DELETE SET NULL",
          "FOREIGN KEY (katalog_maklon_id) REFERENCES katalog_maklon(id) ON DELETE SET NULL",
        ].join(",\n              ");
        const colList = (
          db.prepare("PRAGMA table_info(item_penjualan)").all() as Array<{
            name: string;
          }>
        )
          .map((c) => `"${c.name}"`)
          .join(", ");

        const rebuild = db.transaction(() => {
          db.pragma("foreign_keys = OFF");
          db.exec(`
            CREATE TABLE item_penjualan__new (
              ${colDefs}
            )
          `);
          db.exec(
            `INSERT INTO item_penjualan__new (${colList})
             SELECT ${colList} FROM item_penjualan`,
          );
          db.exec("DROP TABLE item_penjualan");
          db.exec("ALTER TABLE item_penjualan__new RENAME TO item_penjualan");
          db.exec(
            "CREATE INDEX IF NOT EXISTS idx_item_penjualan_sync_status ON item_penjualan(sync_status)",
          );
          db.exec(
            "CREATE INDEX IF NOT EXISTS idx_item_penjualan_tipe_item ON item_penjualan(tipe_item)",
          );
          db.exec(
            "CREATE INDEX IF NOT EXISTS idx_item_penjualan_pembelian_terkait ON item_penjualan(pembelian_id_terkait)",
          );
          db.pragma("foreign_keys = ON");
        });
        rebuild();
      }
    }

    // Migrasi (20260707000003): lebarkan CHECK metode_bayar_vendor_default di
    // katalog_maklon supaya menerima 'TRANSFER'. Rebuild tabel (sama pola di atas).
    {
      const oldCheck = db
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type='table' AND name='katalog_maklon'
           AND sql LIKE '%metode_bayar_vendor_default IN (''CASH'',''NET30''))%' AND sql NOT LIKE '%TRANSFER%' LIMIT 1`,
        )
        .get();
      if (oldCheck) {
        const colInfo = (
          db.prepare("PRAGMA table_info(katalog_maklon)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).filter((c) => !c.pk);
        const pkCol = (
          db.prepare("PRAGMA table_info(katalog_maklon)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).find((c) => c.pk);
        const colDefs = [
          pkCol
            ? `"${pkCol.name}" ${pkCol.type || "TEXT"} PRIMARY KEY`
            : '"id" TEXT PRIMARY KEY',
          ...colInfo.map((c) => {
            // Injeksi CHECK baru untuk kolom metode_bayar_vendor_default.
            if (c.name === "metode_bayar_vendor_default") {
              return `"metode_bayar_vendor_default" TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30','TRANSFER'))`;
            }
            let sql = `"${c.name}" ${c.type || "TEXT"}`;
            if (c.notnull) sql += " NOT NULL";
            if (c.dflt_value != null) {
              // Literal (angka/string/true/false/null) langsung; ekspresi (mis. datetime('now')) bungkus parens.
              const dv = c.dflt_value;
              const isLiteral =
                /^[-'0-9]/.test(dv) || /^(true|false|null)$/i.test(dv);
              sql += ` DEFAULT ${isLiteral ? dv : `(${dv})`}`;
            }
            return sql;
          }),
          "FOREIGN KEY (vendor_subkontrak_id_default) REFERENCES vendor(id) ON DELETE SET NULL",
          "FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL",
          "FOREIGN KEY (dibuat_oleh) REFERENCES profil(id)",
        ].join(",\n              ");
        const colList = (
          db.prepare("PRAGMA table_info(katalog_maklon)").all() as Array<{
            name: string;
          }>
        )
          .map((c) => `"${c.name}"`)
          .join(", ");

        const rebuild = db.transaction(() => {
          db.pragma("foreign_keys = OFF");
          db.exec(`
            CREATE TABLE katalog_maklon__new (
              ${colDefs}
            )
          `);
          db.exec(
            `INSERT INTO katalog_maklon__new (${colList})
             SELECT ${colList} FROM katalog_maklon`,
          );
          db.exec("DROP TABLE katalog_maklon");
          db.exec("ALTER TABLE katalog_maklon__new RENAME TO katalog_maklon");
          db.exec(
            "CREATE INDEX IF NOT EXISTS idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan)",
          );
          db.pragma("foreign_keys = ON");
        });
        rebuild();
      }
    }

    // Migrasi: unik produk jual per barang (ganti unik satuan legacy)
    {
      const legacyUnique = db
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'table'
             AND name = 'harga_barang_satuan'
             AND sql LIKE '%UNIQUE(barang_id, nama_satuan)%'
           LIMIT 1`,
        )
        .get();
      const legacyUniqueIndexes = (
        db.prepare("PRAGMA index_list(harga_barang_satuan)").all() as Array<{
          name: string;
          unique: number;
          origin?: string;
        }>
      ).filter((idx) => {
        if (
          !idx.unique ||
          idx.name === "idx_harga_barang_satuan_nama_produk_unik"
        ) {
          return false;
        }
        const cols = db
          .prepare(`PRAGMA index_info(${JSON.stringify(idx.name)})`)
          .all() as Array<{ name: string }>;
        return (
          cols.length === 2 &&
          cols[0]?.name === "barang_id" &&
          cols[1]?.name === "nama_satuan"
        );
      });
      for (const idx of legacyUniqueIndexes) {
        db.exec(`DROP INDEX IF EXISTS "${idx.name.replace(/"/g, '""')}"`);
      }
      const newIndexExists = db
        .prepare(
          `SELECT 1 FROM sqlite_master
           WHERE type = 'index'
             AND name = 'idx_harga_barang_satuan_nama_produk_unik'
           LIMIT 1`,
        )
        .get();

      if (legacyUnique && !newIndexExists) {
        const colInfo = (
          db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).filter((c) => !c.pk);
        const pkCol = (
          db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{
            name: string;
            type: string;
            notnull: number;
            dflt_value: string | null;
            pk: number;
          }>
        ).find((c) => c.pk);
        const colDefs = [
          pkCol
            ? `"${pkCol.name}" ${pkCol.type || "TEXT"} PRIMARY KEY`
            : '"id" TEXT PRIMARY KEY',
          ...colInfo.map((c) => {
            let sql = `"${c.name}" ${c.type || "TEXT"}`;
            if (c.notnull) sql += " NOT NULL";
            if (c.dflt_value != null) sql += ` DEFAULT ${c.dflt_value}`;
            return sql;
          }),
          "FOREIGN KEY (barang_id) REFERENCES barang(id) ON DELETE CASCADE",
        ].join(",\n              ");
        const colList = (
          db.prepare("PRAGMA table_info(harga_barang_satuan)").all() as Array<{
            name: string;
          }>
        )
          .map((c) => `"${c.name}"`)
          .join(", ");

        const rebuild = db.transaction(() => {
          db.pragma("foreign_keys = OFF");
          db.exec(`
            CREATE TABLE harga_barang_satuan__new (
              ${colDefs}
            )
          `);
          db.exec(
            `INSERT INTO harga_barang_satuan__new (${colList})
             SELECT ${colList} FROM harga_barang_satuan`,
          );
          db.exec("DROP TABLE harga_barang_satuan");
          db.exec(
            "ALTER TABLE harga_barang_satuan__new RENAME TO harga_barang_satuan",
          );
          db.exec(`
            CREATE UNIQUE INDEX idx_harga_barang_satuan_nama_produk_unik
              ON harga_barang_satuan (
                barang_id,
                lower(trim(coalesce(nullif(trim(nama_produk_jual), ''), nama_satuan)))
              )
          `);
          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_harga_barang_satuan_sync_status
              ON harga_barang_satuan(sync_status)
          `);
          db.pragma("foreign_keys = ON");
        });
        rebuild();
      } else if (!newIndexExists) {
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_harga_barang_satuan_nama_produk_unik
            ON harga_barang_satuan (
              barang_id,
              lower(trim(coalesce(nullif(trim(nama_produk_jual), ''), nama_satuan)))
            )
        `);
      }
    }

    // Migrasi: barang_komponen dimensi (jumlah_roll, panjang, lebar)
    {
      const tableExists = db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='barang_komponen' LIMIT 1",
        )
        .get();
      if (tableExists) {
        let cols = (
          db.prepare("PRAGMA table_info(barang_komponen)").all() as Array<{
            name: string;
          }>
        ).map((c) => c.name);
        if (!cols.includes("jumlah_roll")) {
          db.exec("ALTER TABLE barang_komponen ADD COLUMN jumlah_roll INTEGER");
        }
        if (!cols.includes("panjang")) {
          db.exec("ALTER TABLE barang_komponen ADD COLUMN panjang REAL");
        }
        if (!cols.includes("lebar")) {
          db.exec("ALTER TABLE barang_komponen ADD COLUMN lebar REAL");
        }
        // B2: scope BOM per produk jual — kolom unit_price_id (FK ke harga_barang_satuan).
        // Refresh cols supaya cek unit_price_id idempoten setelah ALTER di atas.
        cols = (
          db.prepare("PRAGMA table_info(barang_komponen)").all() as Array<{
            name: string;
          }>
        ).map((c) => c.name);
        if (!cols.includes("unit_price_id")) {
          db.exec(
            "ALTER TABLE barang_komponen ADD COLUMN unit_price_id TEXT REFERENCES harga_barang_satuan(id) ON DELETE CASCADE",
          );
        }
        // B3: backfill NULL → 1. SQLite tidak support SET DEFAULT after ADD easily.
        try {
          db.exec(
            "UPDATE barang_komponen SET jumlah_roll = 1 WHERE jumlah_roll IS NULL",
          );
        } catch (_e) {
          // Toleransi: kolom mungkin belum ada di fresh install.
        }
      }
    }

    // Keranjang tersimpan (parkir cart di POS). IF NOT EXISTS menangani
    // instalasi existing sekaligus fresh-install.
    db.exec(`
      CREATE TABLE IF NOT EXISTS keranjang_tersimpan (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        pelanggan_id TEXT,
        pelanggan_nama_snapshot TEXT,
        pelanggan_kota TEXT,
        prioritas TEXT NOT NULL DEFAULT 'NORMAL',
        ppn_snapshot TEXT,
        cart_snapshot TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'AKTIF',
        penawaran_id TEXT,
        kedaluwarsa_pada TEXT,
        dibuat_oleh TEXT,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 1,
        updated_at_server TEXT,
        updated_by_device TEXT NOT NULL DEFAULT 'server',
        change_version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_keranjang_tersimpan_status ON keranjang_tersimpan(status, kedaluwarsa_pada)`,
    );

    // Katalog produk maklon berulang.
    db.exec(`
      CREATE TABLE IF NOT EXISTS katalog_maklon (
        id TEXT PRIMARY KEY,
        nama_produk TEXT NOT NULL,
        nama_satuan TEXT NOT NULL DEFAULT 'pcs',
        harga_jual_default REAL NOT NULL DEFAULT 0,
        biaya_subkontrak_default REAL NOT NULL DEFAULT 0,
        vendor_subkontrak_id_default TEXT,
        metode_bayar_vendor_default TEXT NOT NULL DEFAULT 'CASH' CHECK(metode_bayar_vendor_default IN ('CASH','NET30','TRANSFER')),
        kategori TEXT,
        kategori_id TEXT,
        populer_status INTEGER NOT NULL DEFAULT 0,
        butuh_dimensi_status INTEGER NOT NULL DEFAULT 0,
        catatan_internal TEXT,
        is_aktif INTEGER NOT NULL DEFAULT 1,
        urutan INTEGER NOT NULL DEFAULT 0,
        dibuat_oleh TEXT,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        diperbarui_pada TEXT NOT NULL DEFAULT (datetime('now')),
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 1,
        updated_at_server TEXT,
        updated_by_device TEXT NOT NULL DEFAULT 'server',
        change_version INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_katalog_maklon_aktif_urutan ON katalog_maklon(is_aktif, urutan)`,
    );

    // Tabel laporan_bulanan: riwayat laporan bulanan digenerate
    db.exec(`
      CREATE TABLE IF NOT EXISTS laporan_bulanan (
        id TEXT PRIMARY KEY,
        nomor_laporan TEXT NOT NULL UNIQUE,
        accounting_period_id TEXT NOT NULL,
        dibuat_oleh TEXT NOT NULL,
        dibuat_pada TEXT NOT NULL DEFAULT (datetime('now')),
        kata_pembuka TEXT,
        kata_penutup TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        updated_at_server TEXT,
        updated_by_device TEXT,
        change_version INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        client_mutation_id TEXT
      )
    `);
  }

  private async queueToLocalSync(
    table: string,
    operation: "insert" | "update" | "delete",
    data: any,
    recordId?: string,
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
        now,
      );
      console.debug(`📝 Queued ${operation} on ${table} for later sync`);
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
      console.debug(
        "🔴 Supabase not available, skipping sync queue processing",
      );
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

      console.debug(
        `🔄 Processing ${pendingOps.length} pending sync operations...`,
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
              data,
            );
          } else if (op.operation === "delete") {
            result = await this.deleteServerSupabase(
              op.table_name,
              op.record_id,
            );
          }

          if (result && !result.error) {
            // Mark as completed
            const updateStmt = db.prepare(`
              UPDATE sync_queue SET status = 'completed' WHERE id = ?
            `);
            updateStmt.run(op.id);
            console.debug(`✅ Synced ${op.operation} on ${op.table_name}`);
          } else {
            console.error(
              `❌ Failed to sync ${op.operation} on ${op.table_name}:`,
              result?.error,
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
        console.debug(
          `🧹 Cleaned up ${cleaned.changes} old sync queue entries`,
        );
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

    // Server-side: Use SQLite directly when available.
    // Falls through to a no-op when SQLite is skipped (web / Vercel) — the
    // caller is expected to be using Supabase for actual writes; raw SQL
    // here is used only by legacy paths that have already been migrated.
    if (isServerSide()) {
      const db = await getServerSQLite();
      if (!db) {
        // No-op in Supabase-only mode. Returning a benign result keeps
        // legacy code paths (transaction BEGIN/COMMIT/ROLLBACK) working
        // without crashing — the actual data writes happen via Supabase
        // higher up the stack.
        return { changes: 0, lastInsertRowid: 0 };
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
   * Execute operations in transaction.
   *
   * Behaviour by environment:
   *   - Tauri desktop: real SQLite transaction (BEGIN/COMMIT/ROLLBACK).
   *   - Server with SQLite mirror enabled: real SQLite transaction.
   *   - Server WITHOUT SQLite (web/Vercel default): sequential execution
   *     against Supabase. PostgREST has no client-side transaction
   *     primitive, so the operations are simply chained — same semantics
   *     the browser path uses.
   *   - Browser: sequential execution.
   */
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    // Real SQLite transaction is only meaningful when a native handle is
    // available. Avoid calling executeRaw("BEGIN TRANSACTION") here because
    // executeRaw becomes a no-op when SQLite is skipped, which would yield
    // BEGIN-without-COMMIT side effects in custom executors.
    if (isTauriApp()) {
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

    if (isServerSide()) {
      const sqlite = await getServerSQLite();
      if (sqlite) {
        try {
          await this.executeRaw("BEGIN TRANSACTION");
          const result = await operations();
          await this.executeRaw("COMMIT");
          return result;
        } catch (error) {
          try {
            await this.executeRaw("ROLLBACK");
          } catch {
            // ROLLBACK can fail if BEGIN never landed; ignore.
          }
          console.error("Transaction rolled back:", error);
          throw error;
        }
      }
      // Supabase-only path: no cross-statement transaction available.
      // Run sequentially; individual mutations are still atomic at the row
      // level on the Postgres side.
      return await operations();
    }

    // Browser: No transaction support, just execute.
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

    // Server-side: Use SQLite directly when available.
    // Falls through to an empty result when SQLite is skipped — caller
    // should rely on Supabase queries via the higher-level db.query().
    if (isServerSide()) {
      const db = await getServerSQLite();
      if (!db) {
        return [] as T[];
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
    records: Record<string, any>[],
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
      // Pure web mode without Tauri — sync is handled server-side via
      // /api/sync. Return success with 0 so the client-side cycle doesn't
      // report spurious failures.
      return { success: true, synced: 0, failed: 0 };
    }

    try {
      const result = await invoke<{ synced: number; failed: number }>(
        "sync_to_cloud",
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
        // Supabase not configured — this is a valid SQLite-only / local-dev
        // setup. Return success with 0 so the sync cycle doesn't report
        // spurious failures in the browser console.
        return { success: true, pulled: 0, failed: 0 };
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
                code || message,
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
              "fromSupabase",
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
                  normalized.updated_at_server ??
                  normalized.diperbarui_pada ??
                  null;
                const localUpdatedAt =
                  existing.updated_at_server ??
                  existing.diperbarui_pada ??
                  null;
                shouldCountAsChange =
                  String(remoteUpdatedAt) !== String(localUpdatedAt);
              }
            }
            const entries = Object.entries(normalized).filter(([key]) =>
              columns.has(key),
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
              sqlite.prepare(upsertSql).run(...values);
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
                      .prepare(
                        `UPDATE satuan_barang SET id = ? WHERE nama = ? AND id != ?`,
                      )
                      .run(newId, namaVal, newId);
                    sqlite.prepare(upsertSql).run(...values);
                    if (shouldCountAsChange) pulled++;
                  }
                } catch (retryErr) {
                  console.warn(
                    `⚠ satuan_barang UNIQUE retry failed for row:`,
                    retryErr,
                  );
                }
                continue;
              }

              // For tables with additional UNIQUE constraints beyond the PK
              // (penjualan.nomor_faktur, order_produksi.nomor_spk, etc.),
              // the row already exists locally — skip silently rather than
              // crashing the entire sync pass.
              if (isUniqueError) {
                // Row already present locally; nothing to do.
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
                  .prepare(
                    "SELECT 1 FROM subkategori_barang WHERE id = ? LIMIT 1",
                  )
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
            sqlite.prepare(upsertSql).run(...values);
            if (deferred.shouldCountAsChange) {
              pulled++;
            }
          } catch (retryError: any) {
            console.warn(
              `⚠️ syncFromCloud FK retry failed on table ${deferred.table}:`,
              retryError?.code || retryError?.message || retryError,
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
        "sync_from_cloud",
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
      .slice(2, 11)}`;

    // Execute in transaction (Tauri only, Web executes sequentially)
    return await db.transaction(async () => {
      const defaultUnitPrice =
        materialData.unit_prices.find((up) => up.default_status) ??
        materialData.unit_prices.find(
          (up) => Number(up.faktor_konversi) === 1,
        ) ??
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
          .slice(2, 11)}`;

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
      }),
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
  callback: (db: any) => Promise<T> | T,
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
