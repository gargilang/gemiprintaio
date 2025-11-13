import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, SYNC_TABLES, type SyncResult } from "@/lib/supabase";
import { getDatabase } from "@/lib/sqlite-db";

/**
 * Manual Sync API Endpoint
 *
 * Triggers a manual synchronization between SQLite and Supabase
 * This will sync all records with sync_status='pending'
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔄 Manual sync triggered");

    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase not configured. Please add credentials to .env.local",
        },
        { status: 503 }
      );
    }

    // Initialize Supabase admin client and database
    const supabase = getSupabaseAdmin();
    const db = getDatabase();

    const syncResult: SyncResult = {
      synced: 0,
      conflicts: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
      details: [],
    };

    // Check which tables exist
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    );

    // Sync each table
    for (const tableName of SYNC_TABLES) {
      try {
        // Check if table exists
        const tableExists = tableCheck.get(tableName);

        if (!tableExists) {
          console.log(`   ⊘ Table ${tableName} does not exist, skipping`);
          continue;
        }

        console.log(`📊 Syncing table: ${tableName}`);

        // Get pending records from SQLite
        const pendingRecords = db
          .prepare(`SELECT * FROM ${tableName} WHERE sync_status = 'pending'`)
          .all();

        if (pendingRecords.length === 0) {
          console.log(`   ✓ No pending records in ${tableName}`);
          continue;
        }

        console.log(`   📤 Found ${pendingRecords.length} pending records`);

        let tableSynced = 0;
        let tableErrors = 0;

        // Push records to Supabase
        for (const record of pendingRecords) {
          try {
            // Remove sync-related fields before upserting to Supabase
            const recordData = record as any;
            const {
              sync_status,
              last_synced_at,
              sync_version,
              ...cleanRecord
            } = recordData;

            // Upsert to Supabase
            const { error } = await supabase
              .from(tableName)
              .upsert(cleanRecord, {
                onConflict: "id",
                ignoreDuplicates: false,
              });

            if (error) {
              console.error(
                `   ❌ Error syncing record ${recordData.id}:`,
                error
              );
              tableErrors++;
              syncResult.errors++;
            } else {
              // Update sync status in SQLite
              db.prepare(
                `UPDATE ${tableName} 
                 SET sync_status = 'synced', 
                     last_synced_at = datetime('now'),
                     sync_version = sync_version + 1
                 WHERE id = ?`
              ).run(recordData.id);

              tableSynced++;
              syncResult.synced++;
            }
          } catch (recordError) {
            console.error(`   ❌ Exception syncing record:`, recordError);
            tableErrors++;
            syncResult.errors++;
          }
        }

        syncResult.details?.push({
          table: tableName,
          synced: tableSynced,
          errors: tableErrors,
        });

        console.log(
          `   ✅ ${tableName}: ${tableSynced} synced, ${tableErrors} errors`
        );
      } catch (tableError) {
        console.error(`❌ Error syncing table ${tableName}:`, tableError);
        syncResult.details?.push({
          table: tableName,
          synced: 0,
          errors: 1,
        });
        syncResult.errors++;
      }
    }

    console.log("✅ Manual sync completed:", syncResult);

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${syncResult.synced} records synced, ${syncResult.errors} errors`,
      result: syncResult,
    });
  } catch (error) {
    console.error("❌ Manual sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Get Sync Status
 *
 * Returns current sync status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Check Supabase configuration
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const isConfigured = !!(supabaseUrl && supabaseKey);

    let pendingChanges = 0;
    let lastSyncAt: string | null = null;

    try {
      const db = getDatabase();

      // Check if tables exist before querying
      const tableCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      );

      // Count pending changes across all tables
      for (const tableName of SYNC_TABLES) {
        const tableExists = tableCheck.get(tableName);

        if (tableExists) {
          try {
            const result = db
              .prepare(
                `SELECT COUNT(*) as count FROM ${tableName} WHERE sync_status = 'pending'`
              )
              .get() as { count: number } | undefined;

            if (result) {
              pendingChanges += result.count;
            }
          } catch (tableError) {
            // Skip tables that don't have sync_status column
            console.log(`⚠️ Skipping table ${tableName}:`, tableError);
          }
        }
      }

      // Get last sync timestamp from tables that exist
      const existingTables = SYNC_TABLES.filter((t) => tableCheck.get(t));

      if (existingTables.length > 0) {
        try {
          const lastSyncResult = db
            .prepare(
              `SELECT MAX(last_synced_at) as last_sync FROM (
              ${existingTables
                .map(
                  (t) =>
                    `SELECT MAX(last_synced_at) as last_synced_at FROM ${t} WHERE sync_status = 'synced'`
                )
                .join(" UNION ALL ")}
            )`
            )
            .get() as { last_sync: string | null } | undefined;

          if (lastSyncResult?.last_sync) {
            lastSyncAt = lastSyncResult.last_sync;
          }
        } catch (syncError) {
          console.log("⚠️ Could not get last sync time:", syncError);
        }
      }
    } catch (dbError) {
      console.error("⚠️ Error reading database:", dbError);
      // Continue with default values
    }

    return NextResponse.json({
      success: true,
      status: {
        cloudBackup: isConfigured ? "connected" : "disconnected",
        localDb: "active",
        pendingChanges,
        lastSyncAt,
      },
    });
  } catch (error) {
    console.error("❌ Get sync status error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
