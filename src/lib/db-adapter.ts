/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 *
 * File ini akan dihapus setelah migrasi selesai.
 * Gunakan src/lib/db-unified.ts sebagai gantinya.
 *
 * Database Adapter
 *
 * Universal database layer yang support:
 * 1. Tauri Desktop App: SQLite via Rust commands + background sync to Supabase
 * 2. Web App (online): Supabase PostgreSQL
 * 3. Web App (offline): LocalStorage queue → sync later
 *
 * Strategy:
 * - Tauri: Primary SQLite, background sync to Supabase when online
 * - Web: Primary Supabase, fallback to queue when offline
 * - Offline handling: Queue operations untuk sync later
 *
 * @deprecated Use db-unified.ts instead
 */

import { supabase, isSupabaseAvailable } from "./supabase";
import { isTauriApp } from "./tauri-helper";

// Types
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

// Offline queue interface
interface QueuedOperation {
  id: string;
  table: string;
  operation: "insert" | "update" | "delete";
  data?: any;
  timestamp: number;
}

/**
 * Database Adapter Class
 * Auto-detects environment and routes to appropriate database
 */
export class DatabaseAdapter {
  private static onlineCheckCache: boolean | null = null;
  private static lastOnlineCheck: number = 0;
  private static ONLINE_CHECK_INTERVAL = 5000; // 5 seconds

  /**
   * Check if we should use Supabase (web app online)
   */
  private static async shouldUseSupabase(): Promise<boolean> {
    // Tauri always uses SQLite
    if (isTauriApp()) {
      return false;
    }

    // Web app - check if online and Supabase is available
    const now = Date.now();
    if (
      this.onlineCheckCache !== null &&
      now - this.lastOnlineCheck < this.ONLINE_CHECK_INTERVAL
    ) {
      return this.onlineCheckCache;
    }

    const online = await isSupabaseAvailable();
    this.onlineCheckCache = online;
    this.lastOnlineCheck = now;

    return online;
  }

  /**
   * Execute Tauri command (for desktop app)
   */
  private static async invokeTauriCommand(
    command: string,
    args: any = {}
  ): Promise<any> {
    if (typeof window === "undefined") {
      throw new Error("Tauri commands only work in browser context");
    }

    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(command, args);
  }

  /**
   * Queue operation for later sync (offline web mode)
   */
  private static queueOperation(op: Omit<QueuedOperation, "id" | "timestamp">) {
    try {
      const queue = this.getQueue();
      const newOp: QueuedOperation = {
        ...op,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      queue.push(newOp);
      localStorage.setItem("db_sync_queue", JSON.stringify(queue));
      console.log(`📝 Queued ${op.operation} on ${op.table}:`, newOp.id);
    } catch (e) {
      console.error("Failed to queue operation:", e);
    }
  }

  /**
   * Get queued operations
   */
  public static getQueue(): QueuedOperation[] {
    try {
      const queueStr = localStorage.getItem("db_sync_queue");
      return queueStr ? JSON.parse(queueStr) : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear sync queue
   */
  public static clearQueue() {
    localStorage.removeItem("db_sync_queue");
  }

  /**
   * SELECT query - returns multiple rows
   */
  static async query<T = any>(
    table: string,
    options: {
      select?: string;
      where?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
    } = {}
  ): Promise<QueryResult<T>> {
    try {
      const useSupabase = await this.shouldUseSupabase();

      if (useSupabase) {
        // Supabase query
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

        // Apply limit
        if (options.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Supabase query error:", error);
          return { data: null, error: new Error(error.message) };
        }

        return { data: data as T[], error: null };
      } else {
        // Tauri SQLite query
        let sql = `SELECT ${options.select || "*"} FROM ${table}`;
        const params: any[] = [];

        // Build WHERE clause
        if (options.where && Object.keys(options.where).length > 0) {
          const conditions = Object.keys(options.where).map((key) => {
            params.push(options.where![key]);
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

        // Add LIMIT
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }

        const data = await this.invokeTauriCommand("db_query", { sql, params });
        return { data: data as T[], error: null };
      }
    } catch (error: any) {
      console.error("Database query error:", error);
      return { data: null, error };
    }
  }

  /**
   * SELECT single row
   */
  static async queryOne<T = any>(
    table: string,
    options: {
      select?: string;
      where?: Record<string, any>;
    } = {}
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
   * INSERT record
   */
  static async insert(
    table: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    try {
      const useSupabase = await this.shouldUseSupabase();

      // Generate ID if not provided
      if (!data.id) {
        data.id = crypto.randomUUID();
      }

      if (useSupabase) {
        // Supabase insert
        const { data: inserted, error } = await supabase
          .from(table)
          .insert(data)
          .select("id")
          .single();

        if (error) {
          console.error("Supabase insert error:", error);
          return { data: null, error: new Error(error.message) };
        }

        return { data: { id: inserted.id }, error: null };
      } else {
        // Tauri SQLite insert
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => "?").join(", ");

        const sql = `INSERT INTO ${table} (${columns.join(
          ", "
        )}) VALUES (${placeholders})`;

        await this.invokeTauriCommand("db_execute", { sql, params: values });

        // Queue for sync to Supabase later
        if (typeof window !== "undefined" && !isTauriApp()) {
          this.queueOperation({ table, operation: "insert", data });
        }

        return { data: { id: data.id }, error: null };
      }
    } catch (error: any) {
      console.error("Database insert error:", error);
      return { data: null, error };
    }
  }

  /**
   * UPDATE record
   */
  static async update(
    table: string,
    id: string,
    data: Record<string, any>
  ): Promise<MutationResult> {
    try {
      const useSupabase = await this.shouldUseSupabase();

      if (useSupabase) {
        // Supabase update
        const { error } = await supabase.from(table).update(data).eq("id", id);

        if (error) {
          console.error("Supabase update error:", error);
          return { data: null, error: new Error(error.message) };
        }

        return { data: { id }, error: null };
      } else {
        // Tauri SQLite update
        const updates = Object.keys(data)
          .map((key) => `${key} = ?`)
          .join(", ");
        const values = [...Object.values(data), id];

        const sql = `UPDATE ${table} SET ${updates} WHERE id = ?`;

        await this.invokeTauriCommand("db_execute", { sql, params: values });

        // Queue for sync
        if (typeof window !== "undefined" && !isTauriApp()) {
          this.queueOperation({
            table,
            operation: "update",
            data: { ...data, id },
          });
        }

        return { data: { id }, error: null };
      }
    } catch (error: any) {
      console.error("Database update error:", error);
      return { data: null, error };
    }
  }

  /**
   * DELETE record
   */
  static async delete(table: string, id: string): Promise<MutationResult> {
    try {
      const useSupabase = await this.shouldUseSupabase();

      if (useSupabase) {
        // Supabase delete
        const { error } = await supabase.from(table).delete().eq("id", id);

        if (error) {
          console.error("Supabase delete error:", error);
          return { data: null, error: new Error(error.message) };
        }

        return { data: { id }, error: null };
      } else {
        // Tauri SQLite delete
        const sql = `DELETE FROM ${table} WHERE id = ?`;

        await this.invokeTauriCommand("db_execute", { sql, params: [id] });

        // Queue for sync
        if (typeof window !== "undefined" && !isTauriApp()) {
          this.queueOperation({ table, operation: "delete", data: { id } });
        }

        return { data: { id }, error: null };
      }
    } catch (error: any) {
      console.error("Database delete error:", error);
      return { data: null, error };
    }
  }

  /**
   * Execute raw SQL (for complex queries)
   * Only for Tauri - web app should use Supabase query builder
   */
  static async executeRaw(sql: string, params: any[] = []): Promise<any> {
    if (isTauriApp()) {
      return await this.invokeTauriCommand("db_query", { sql, params });
    } else {
      throw new Error(
        "Raw SQL execution not supported in web mode. Use Supabase query builder."
      );
    }
  }

  /**
   * Sync queued operations to Supabase
   */
  static async syncQueue(): Promise<{ synced: number; failed: number }> {
    const queue = this.getQueue();
    let synced = 0;
    let failed = 0;

    console.log(`🔄 Syncing ${queue.length} queued operations...`);

    for (const op of queue) {
      try {
        switch (op.operation) {
          case "insert":
            await supabase.from(op.table).insert(op.data);
            break;
          case "update":
            await supabase.from(op.table).update(op.data).eq("id", op.data.id);
            break;
          case "delete":
            await supabase.from(op.table).delete().eq("id", op.data.id);
            break;
        }
        synced++;
      } catch (error) {
        console.error(`Failed to sync operation ${op.id}:`, error);
        failed++;
      }
    }

    // Clear queue if all synced
    if (failed === 0) {
      this.clearQueue();
    }

    console.log(`✅ Synced: ${synced}, ❌ Failed: ${failed}`);

    return { synced, failed };
  }
}

// Export convenience functions
export const db = DatabaseAdapter;
