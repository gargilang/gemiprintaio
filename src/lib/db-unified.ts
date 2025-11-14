/**
 * Unified Database Adapter
 *
 * Strategi:
 * 1. Tauri App: SQLite (primary) + Supabase sync (background)
 * 2. Web App: Supabase (primary) + offline queue (fallback)
 *
 * Semua operasi database HARUS melalui adapter ini
 *
 * KONSOLIDASI: File ini menggantikan db-adapter.ts, db.ts, dan sqlite-db.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// NORMALIZATION UTILITIES
// ============================================================================

/**
 * Normalize record untuk konsistensi antara SQLite dan Supabase
 * - Standarisasi field timestamp
 * - Konversi boolean (SQLite 0/1 → true/false)
 * - Pastikan ID konsisten
 */
export function normalizeRecord(
  record: Record<string, any>,
  direction: "toSupabase" | "fromSupabase" | "toSQLite" | "fromSQLite"
): Record<string, any> {
  const normalized: Record<string, any> = { ...record };

  // Standarisasi timestamp fields
  if (direction === "toSupabase" || direction === "toSQLite") {
    // Gunakan created_at & updated_at (standar Inggris)
    if (normalized.dibuat_pada && !normalized.created_at) {
      normalized.created_at = normalized.dibuat_pada;
      delete normalized.dibuat_pada;
    }
    if (normalized.diperbarui_pada && !normalized.updated_at) {
      normalized.updated_at = normalized.diperbarui_pada;
      delete normalized.diperbarui_pada;
    }
  }

  // Boolean normalization
  if (direction === "toSupabase" || direction === "fromSQLite") {
    // SQLite → Supabase: 0/1 → false/true
    Object.keys(normalized).forEach((key) => {
      if (
        typeof normalized[key] === "number" &&
        (normalized[key] === 0 || normalized[key] === 1)
      ) {
        // Hanya konversi field yang kemungkinan boolean
        if (
          key.includes("aktif") ||
          key.includes("is_") ||
          key.includes("has_")
        ) {
          normalized[key] = normalized[key] === 1;
        }
      }
    });
  } else if (direction === "toSQLite" || direction === "fromSupabase") {
    // Supabase → SQLite: true/false → 1/0
    Object.keys(normalized).forEach((key) => {
      if (typeof normalized[key] === "boolean") {
        normalized[key] = normalized[key] ? 1 : 0;
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

// Environment detection
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isTauriApp(): boolean {
  if (!isBrowser()) return false;
  return "__TAURI__" in window;
}

// Supabase client initialization
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!isBrowser()) return null;

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

// Check if online and Supabase is available
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

// ============================================================================
// OFFLINE QUEUE (Unified Format)
// ============================================================================

/**
 * Unified queue operation structure
 * Digunakan untuk Web (localStorage) dan Tauri (sync_queue table)
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
 * UNIFIED QUEUE KEY - satu sumber kebenaran untuk web offline queue
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
    // Untuk Tauri, akan dipanggil via Rust command
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
      // Tauri: Always use SQLite
      if (isTauriApp()) {
        return await this.queryTauri<T>(table, options);
      }

      // Web: Try Supabase first, fallback to cached data
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

      // Add timestamps (standar: created_at, updated_at)
      const now = getCurrentTimestamp();
      data.created_at = data.created_at || now;
      data.updated_at = data.updated_at || now;

      // Tauri: Insert to SQLite
      if (isTauriApp()) {
        const result = await this.insertTauri(table, data);
        // Queue for background sync to Supabase
        this.queueTauriSync(table, "insert", data);
        return result;
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
      // Update timestamp (standar: updated_at)
      data.updated_at = getCurrentTimestamp();

      // Remove id from update data
      const { id: _, ...updateData } = data;

      // Tauri: Update SQLite
      if (isTauriApp()) {
        const result = await this.updateTauri(table, id, updateData);
        // Queue for background sync to Supabase
        this.queueTauriSync(table, "update", updateData, id);
        return result;
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

  /**
   * Execute raw SQL (Tauri only - use with caution)
   * Untuk operasi kompleks yang tidak bisa dilakukan dengan query builder
   */
  async executeRaw(sql: string, params: any[] = []): Promise<any> {
    if (!isTauriApp()) {
      throw new Error("Raw SQL execution only available in Tauri mode");
    }

    try {
      return await invoke("db_execute", { sql, params });
    } catch (error) {
      console.error("Raw SQL execution failed:", error);
      throw error;
    }
  }

  /**
   * Execute operations in transaction (Tauri only)
   * Web mode: No transaction support, operations execute sequentially
   */
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    if (!isTauriApp()) {
      // Web: No transaction support, just execute
      console.warn(
        "Transactions not supported in Web mode - executing sequentially"
      );
      return await operations();
    }

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

  /**
   * Query raw SQL (Tauri only - use with caution)
   */
  async queryRaw<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!isTauriApp()) {
      throw new Error("Raw SQL query only available in Tauri mode");
    }

    try {
      return await invoke<T[]>("db_query", { sql, params });
    } catch (error) {
      console.error("Raw SQL query failed:", error);
      throw error;
    }
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
    if (!isTauriApp()) {
      return { success: false, synced: 0, failed: 0 };
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
      localStorage.setItem("db_offline_queue", JSON.stringify(remainingQueue));
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
