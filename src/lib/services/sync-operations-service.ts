/**
 * Sync Operations Service
 *
 * Provides synchronization functionality for both Tauri and Web environments.
 * Replaces /api/sync/manual and /api/sync/auto API routes.
 *
 * @module sync-operations-service
 */

import "server-only";
import { createClient } from "@supabase/supabase-js";

import { db, isTauriApp } from "../db-unified";
import {
  CORE_SYNC_TABLES,
  BALANCE_SYNC_TABLES,
  MASTER_SYNC_TABLES,
  REALTIME_PULL_ENABLED,
  SYNC_ENGINE_V2,
  SYNC_WAVE,
  WEB_SERVER_MEDIATED_ONLY,
} from "../sync-config";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SyncStatus {
  localDb: "active" | "error";
  cloudBackup: "connected" | "disconnected" | "syncing";
  pendingChanges: number;
  lastSyncAt: string | null;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  pulled?: number;
  message?: string;
  timestamp: string;
}

export interface AutoSyncSettings {
  enabled: boolean;
  intervalMinutes: number;
}

// ============================================================================
// AUTO-SYNC STATE (Client-side only)
// ============================================================================

let autoSyncInterval: NodeJS.Timeout | null = null;
let autoSyncSettings: AutoSyncSettings = {
  enabled: false,
  intervalMinutes: 20,
};

// ============================================================================
// MANUAL SYNC OPERATIONS
// ============================================================================

/**
 * Get current sync status
 * Returns pending changes count, last sync time, and connection status
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const isConfigured = !!(supabaseUrl && supabaseKey);
    let cloudBackup: SyncStatus["cloudBackup"] = "disconnected";

    if (isConfigured && supabaseUrl && supabaseKey) {
      try {
        const client = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await client.from("profil").select("id").limit(1);
        cloudBackup = error ? "disconnected" : "connected";
      } catch {
        cloudBackup = "disconnected";
      }
    }

    const pendingChanges = await db.getPendingSyncCount();
    const lastSyncAt: string | null = null;

    return {
      localDb: "active",
      cloudBackup,
      pendingChanges,
      lastSyncAt,
    };
  } catch (error) {
    console.error("Error getting sync status:", error);
    return {
      localDb: "active",
      cloudBackup: "disconnected",
      pendingChanges: 0,
      lastSyncAt: null,
    };
  }
}

/**
 * Trigger manual synchronization
 * Syncs pending changes from local DB to cloud (Tauri) or processes offline queue (Web)
 */
export async function triggerManualSync(): Promise<SyncResult> {
  try {
    const result = await db.syncToCloud();

    return {
      success: result.success,
      synced: result.synced,
      failed: result.failed,
      message: result.success
        ? `Successfully synced ${result.synced} records`
        : `Synced ${result.synced} records with ${result.failed} failures`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Manual sync error:", error);
    return {
      success: false,
      synced: 0,
      failed: 0,
      message: error instanceof Error ? error.message : "Unknown sync error",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Pull changes from cloud to local store (Tauri only, no-op for web)
 */
export async function triggerPullFromCloud(): Promise<SyncResult> {
  try {
    const result = await db.syncFromCloud();
    return {
      success: result.success,
      synced: 0,
      pulled: result.pulled,
      failed: result.failed,
      message: result.success
        ? `Successfully pulled ${result.pulled} records`
        : `Pulled ${result.pulled} records with ${result.failed} failures`,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // syncFromCloud is a no-op when Supabase is not configured (web-only /
    // SQLite-only mode). Treat it as a silent success so the sync cycle
    // doesn't report spurious failures in the console.
    const msg = error instanceof Error ? error.message : String(error);
    const isNoOp =
      msg.includes("not configured") ||
      msg.includes("not available") ||
      msg.includes("not supported") ||
      msg.includes("no-op");
    if (isNoOp) {
      return {
        success: true,
        synced: 0,
        pulled: 0,
        failed: 0,
        message: "Pull skipped (cloud not configured)",
        timestamp: new Date().toISOString(),
      };
    }
    return {
      success: false,
      synced: 0,
      pulled: 0,
      failed: 1,
      message: msg,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Full two-way sync cycle: push local queue then pull remote changes.
 */
export async function triggerSyncCycle(): Promise<SyncResult> {
  const push = await triggerManualSync();
  const pull = await triggerPullFromCloud();
  return {
    success: push.success && pull.success,
    synced: push.synced,
    pulled: pull.pulled ?? 0,
    failed: push.failed + pull.failed,
    message: `push=${push.synced}/${push.failed}, pull=${pull.pulled ?? 0}/${pull.failed}`,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Process sync queue (server-side only)
 * Process pending operations from sync_queue table when connection is restored
 */
export async function processSyncQueue(): Promise<SyncResult> {
  try {
    console.log("🔄 Processing sync queue via service...");
    await db.processSyncQueue();

    return {
      success: true,
      synced: 0, // db.processSyncQueue doesn't return count yet
      failed: 0,
      message: "Sync queue processed successfully",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Sync queue processing error:", error);
    return {
      success: false,
      synced: 0,
      failed: 0,
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// AUTO-SYNC OPERATIONS
// ============================================================================

/**
 * Get auto-sync settings
 */
export function getAutoSyncSettings(): AutoSyncSettings {
  return { ...autoSyncSettings };
}

/**
 * Start auto-sync with specified interval
 * @param intervalMinutes - Sync interval in minutes (default: 20)
 */
export function startAutoSync(intervalMinutes: number = 20): {
  success: boolean;
  message: string;
  settings: AutoSyncSettings;
} {
  try {
    // Stop existing interval if running
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
    }

    // Start new interval
    autoSyncInterval = setInterval(async () => {
      console.log("🔄 Auto-sync triggered");
      const result = await triggerManualSync();
      console.log("✅ Auto-sync result:", result);
    }, intervalMinutes * 60 * 1000);

    // Update settings
    autoSyncSettings = {
      enabled: true,
      intervalMinutes,
    };

    return {
      success: true,
      message: `Auto-sync started with ${intervalMinutes} minute interval`,
      settings: autoSyncSettings,
    };
  } catch (error) {
    console.error("Error starting auto-sync:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to start auto-sync",
      settings: autoSyncSettings,
    };
  }
}

/**
 * Stop auto-sync
 */
export function stopAutoSync(): {
  success: boolean;
  message: string;
  settings: AutoSyncSettings;
} {
  try {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }

    autoSyncSettings = {
      enabled: false,
      intervalMinutes: autoSyncSettings.intervalMinutes,
    };

    return {
      success: true,
      message: "Auto-sync stopped",
      settings: autoSyncSettings,
    };
  } catch (error) {
    console.error("Error stopping auto-sync:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to stop auto-sync",
      settings: autoSyncSettings,
    };
  }
}

/**
 * Update auto-sync interval
 * Restarts auto-sync with new interval if it was already running
 */
export function updateAutoSyncInterval(intervalMinutes: number): {
  success: boolean;
  message: string;
  settings: AutoSyncSettings;
} {
  const wasEnabled = autoSyncSettings.enabled;

  if (wasEnabled) {
    // Stop current auto-sync
    stopAutoSync();
    // Start with new interval
    return startAutoSync(intervalMinutes);
  } else {
    // Just update the setting without starting
    autoSyncSettings.intervalMinutes = intervalMinutes;
    return {
      success: true,
      message: `Auto-sync interval updated to ${intervalMinutes} minutes (not started)`,
      settings: autoSyncSettings,
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if sync is available in current environment
 * Tauri: Always available (uses sync_to_cloud command)
 * Web: Only available if online and Supabase is configured
 */
export function isSyncAvailable(): boolean {
  if (isTauriApp()) {
    return true; // Tauri always has sync capability
  }

  // Web: Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(supabaseUrl && supabaseKey);
}

/**
 * Get environment info for debugging
 */
export function getSyncEnvironmentInfo(): {
  environment: "tauri" | "web";
  syncAvailable: boolean;
  autoSyncEnabled: boolean;
  intervalMinutes: number;
} {
  return {
    environment: isTauriApp() ? "tauri" : "web",
    syncAvailable: isSyncAvailable(),
    autoSyncEnabled: autoSyncSettings.enabled,
    intervalMinutes: autoSyncSettings.intervalMinutes,
  };
}

export async function getRolloutMetrics() {
  const pending = await db.getPendingSyncCount();
  return {
    flags: {
      SYNC_ENGINE_V2,
      REALTIME_PULL_ENABLED,
      WEB_SERVER_MEDIATED_ONLY,
      SYNC_WAVE,
    },
    waves: {
      wave1: CORE_SYNC_TABLES,
      wave2: BALANCE_SYNC_TABLES,
      wave3: MASTER_SYNC_TABLES,
    },
    pendingChanges: pending,
    generatedAt: new Date().toISOString(),
  };
}
