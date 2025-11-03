/**
 * Sync Service
 * Handles synchronization between SQLite (offline) and Supabase (cloud)
 */

import { supabase } from "./supabase";
import * as sqlite from "./sqlite-db";

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Sync all pending changes to Supabase
 */
export async function syncToCloud(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    // Get pending sync operations
    const pendingOps = sqlite.getPendingSyncOperations(100);

    console.log(`Starting sync: ${pendingOps.length} operations pending`);

    for (const op of pendingOps) {
      try {
        await syncOperation(op);
        sqlite.markSyncCompleted(op.id, op.table_name);
        result.synced++;
      } catch (error: any) {
        console.error(`Failed to sync operation ${op.id}:`, error);
        sqlite.markSyncFailed(op.id, error.message);
        result.failed++;
        result.errors.push(
          `${op.table_name}/${op.operation}: ${error.message}`
        );
      }
    }

    result.success = result.failed === 0;
    console.log(
      `Sync completed: ${result.synced} synced, ${result.failed} failed`
    );

    return result;
  } catch (error: any) {
    console.error("Sync error:", error);
    return {
      success: false,
      synced: result.synced,
      failed: result.failed,
      errors: [...result.errors, error.message],
    };
  }
}

/**
 * Sync a single operation to Supabase
 */
async function syncOperation(op: any): Promise<void> {
  const data = op.data ? JSON.parse(op.data) : null;

  switch (op.operation) {
    case "INSERT":
      await syncInsert(op.table_name, data);
      break;
    case "UPDATE":
      await syncUpdate(op.table_name, op.record_id, data);
      break;
    case "DELETE":
      await syncDelete(op.table_name, op.record_id);
      break;
    default:
      throw new Error(`Unknown operation: ${op.operation}`);
  }
}

/**
 * Sync INSERT operation
 */
async function syncInsert(table: string, data: any): Promise<void> {
  // Convert SQLite types to Supabase types
  const convertedData = convertSQLiteToSupabase(data);

  const { error } = await supabase
    .from(table)
    .upsert(convertedData, { onConflict: "id" });

  if (error) throw error;
}

/**
 * Sync UPDATE operation
 */
async function syncUpdate(table: string, id: string, data: any): Promise<void> {
  const convertedData = convertSQLiteToSupabase(data);

  const { error } = await supabase
    .from(table)
    .update(convertedData)
    .eq("id", id);

  if (error) throw error;
}

/**
 * Sync DELETE operation
 */
async function syncDelete(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) throw error;
}

/**
 * Convert SQLite data types to Supabase compatible format
 */
function convertSQLiteToSupabase(data: any): any {
  if (!data) return data;

  const converted: any = {};

  for (const [key, value] of Object.entries(data)) {
    // Convert SQLite integers (0/1) to boolean
    if (key === "is_active" || key === "is_member" || key === "is_paid") {
      converted[key] = value === 1 || value === true;
    }
    // Keep other values as-is
    else {
      converted[key] = value;
    }
  }

  return converted;
}

/**
 * Pull data from Supabase to SQLite (for initial setup or refresh)
 */
export async function pullFromCloud(
  tables: string[] = []
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    synced: 0,
    failed: 0,
    errors: [],
  };

  const tablesToSync =
    tables.length > 0
      ? tables
      : [
          "profiles",
          "materials",
          "customers",
          "vendors",
          "sales",
          "sales_items",
          "purchases",
          "purchase_items",
          "financial_transactions",
          "other_transactions",
          "inventory_movements",
        ];

  for (const table of tablesToSync) {
    try {
      await pullTableFromCloud(table);
      result.synced++;
    } catch (error: any) {
      console.error(`Failed to pull ${table}:`, error);
      result.failed++;
      result.errors.push(`${table}: ${error.message}`);
    }
  }

  result.success = result.failed === 0;
  return result;
}

/**
 * Pull single table from Supabase
 */
async function pullTableFromCloud(table: string): Promise<void> {
  const { data, error } = await supabase.from(table).select("*");

  if (error) throw error;

  if (!data || data.length === 0) return;

  const db = sqlite.getDatabase();

  // Use transaction for bulk insert
  const transaction = db.transaction(() => {
    for (const record of data) {
      // Convert Supabase boolean to SQLite integer
      const converted = convertSupabaseToSQLite(record);

      try {
        // Try insert first
        const columns = Object.keys(converted);
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map((col) => converted[col]);

        db.prepare(
          `INSERT OR REPLACE INTO ${table} (${columns.join(
            ", "
          )}) VALUES (${placeholders})`
        ).run(...values);
      } catch (error: any) {
        console.error(`Error inserting record into ${table}:`, error);
      }
    }
  });

  transaction();
}

/**
 * Convert Supabase data to SQLite compatible format
 */
function convertSupabaseToSQLite(data: any): any {
  if (!data) return data;

  const converted: any = {};

  for (const [key, value] of Object.entries(data)) {
    // Convert boolean to SQLite integer
    if (typeof value === "boolean") {
      converted[key] = value ? 1 : 0;
    }
    // Keep other values as-is
    else {
      converted[key] = value;
    }
  }

  return converted;
}

/**
 * Auto-sync at intervals
 */
let syncInterval: NodeJS.Timeout | null = null;

export function startAutoSync(intervalMinutes: number = 120): void {
  if (syncInterval) {
    console.log("Auto-sync already running");
    return;
  }

  console.log(`Starting auto-sync every ${intervalMinutes} minutes`);

  syncInterval = setInterval(async () => {
    console.log("Auto-sync triggered");
    const result = await syncToCloud();
    console.log("Auto-sync result:", result);
  }, intervalMinutes * 60 * 1000);
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("Auto-sync stopped");
  }
}

/**
 * Get sync statistics
 */
export function getSyncStats() {
  const metadata = sqlite.getSyncMetadata();
  const pendingChanges = sqlite.getTotalPendingChanges();
  const pendingOps = sqlite.getPendingSyncOperations(1000);

  return {
    totalPending: pendingChanges,
    tables: metadata,
    recentOperations: pendingOps.slice(0, 10),
    autoSyncEnabled: syncInterval !== null,
  };
}
