/**
 * Backup Operations Service
 *
 * Provides database backup functionality for both Tauri and Web environments.
 * Replaces /api/backup/* API routes.
 *
 * @module backup-service
 */

import "server-only";

import { isTauriApp, isBrowser } from "../db-unified";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BackupInfo {
  exists: boolean;
  path?: string;
  size?: number;
  sizeMB?: string;
  lastModified?: Date;
  lastModifiedFormatted?: string;
  error?: string;
  message?: string;
}

export interface BackupStatus {
  isRunning: boolean;
  isInitialized: boolean;
  currentInterval: number;
  currentIntervalMinutes: string;
  lastBackupTime: Date | null;
  nextBackupTime: Date | null;
  isBackingUp: boolean;
}

export interface BackupSettings {
  currentInterval: number;
  currentIntervalMinutes: string;
  isRunning: boolean;
  lastBackupTime: Date | null;
  nextBackupTime: Date | null;
  minInterval: number;
  maxInterval: number;
  presets: Record<string, number>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const MIN_BACKUP_INTERVAL = 30000; // 30 seconds
export const MAX_BACKUP_INTERVAL = 86400000; // 24 hours
export const DEFAULT_BACKUP_INTERVAL = 600000; // 10 minutes

export const BACKUP_INTERVAL_PRESETS = {
  "30s": 30000,
  "1m": 60000,
  "5m": 300000,
  "10m": 600000,
  "30m": 1800000,
  "1h": 3600000,
} as const;

// ============================================================================
// CLIENT-SIDE AUTO-BACKUP STATE (Web only)
// ============================================================================

interface ClientBackupService {
  timer: NodeJS.Timeout | null;
  isBackingUp: boolean;
  currentInterval: number;
  lastBackupTime: Date | null;
  nextBackupTime: Date | null;
  isInitialized: boolean;
}

let clientService: ClientBackupService = {
  timer: null,
  isBackingUp: false,
  currentInterval: DEFAULT_BACKUP_INTERVAL,
  lastBackupTime: null,
  nextBackupTime: null,
  isInitialized: false,
};

// ============================================================================
// BACKUP OPERATIONS
// ============================================================================

/**
 * Create a manual backup
 * - Tauri: Uses Tauri command (file system access)
 * - Web: Currently not supported (would need server-side implementation)
 */
export async function createBackup(): Promise<{
  success: boolean;
  message: string;
}> {
  if (isTauriApp()) {
    try {
      // Call Tauri command to create backup
      // This command should be implemented in src-tauri/src/main.rs
      await invoke("create_database_backup");
      return {
        success: true,
        message: "Backup created successfully",
      };
    } catch (error) {
      console.error("Backup failed:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to create backup",
      };
    }
  } else {
    // Web: Backup not supported (no file system access)
    // Could potentially export data as JSON download
    return {
      success: false,
      message: "Backup is only available in desktop mode",
    };
  }
}

/**
 * Get backup file information
 */
export async function getBackupInfo(): Promise<BackupInfo> {
  if (isTauriApp()) {
    try {
      // Call Tauri command to get backup info
      const info = await invoke<BackupInfo>("get_backup_info");
      return info;
    } catch (error) {
      console.error("Failed to get backup info:", error);
      return {
        exists: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  } else {
    // Web: Return unavailable status
    return {
      exists: false,
      message: "Backup info is only available in desktop mode",
    };
  }
}

/**
 * Get backup service status
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  if (isTauriApp()) {
    try {
      // Call Tauri command to get backup status
      const status = await invoke<BackupStatus>("get_backup_status");
      return status;
    } catch (error) {
      console.error("Failed to get backup status:", error);
      return {
        isRunning: false,
        isInitialized: false,
        currentInterval: DEFAULT_BACKUP_INTERVAL,
        currentIntervalMinutes: "10.0",
        lastBackupTime: null,
        nextBackupTime: null,
        isBackingUp: false,
      };
    }
  } else {
    // Web: Return client-side status (if any)
    return {
      isRunning: clientService.timer !== null,
      isInitialized: clientService.isInitialized,
      currentInterval: clientService.currentInterval,
      currentIntervalMinutes: (
        clientService.currentInterval /
        1000 /
        60
      ).toFixed(1),
      lastBackupTime: clientService.lastBackupTime,
      nextBackupTime: clientService.nextBackupTime,
      isBackingUp: clientService.isBackingUp,
    };
  }
}

/**
 * Get backup settings (includes status + configuration options)
 */
export async function getBackupSettings(): Promise<BackupSettings> {
  const status = await getBackupStatus();

  return {
    currentInterval: status.currentInterval,
    currentIntervalMinutes: status.currentIntervalMinutes,
    isRunning: status.isRunning,
    lastBackupTime: status.lastBackupTime,
    nextBackupTime: status.nextBackupTime,
    minInterval: MIN_BACKUP_INTERVAL,
    maxInterval: MAX_BACKUP_INTERVAL,
    presets: { ...BACKUP_INTERVAL_PRESETS },
  };
}

/**
 * Update backup interval
 * Restarts the backup service with new interval if it was running
 */
export async function updateBackupInterval(interval: number): Promise<{
  success: boolean;
  message: string;
  settings?: BackupSettings;
}> {
  // Validate interval
  if (interval < MIN_BACKUP_INTERVAL || interval > MAX_BACKUP_INTERVAL) {
    return {
      success: false,
      message: `Interval must be between ${MIN_BACKUP_INTERVAL}ms and ${MAX_BACKUP_INTERVAL}ms`,
    };
  }

  if (isTauriApp()) {
    try {
      // Call Tauri command to update backup interval
      await invoke("update_backup_interval", { interval });

      const settings = await getBackupSettings();

      return {
        success: true,
        message: "Backup interval updated successfully",
        settings,
      };
    } catch (error) {
      console.error("Failed to update backup interval:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to update interval",
      };
    }
  } else {
    // Web: Update client-side state only
    clientService.currentInterval = interval;

    // If auto-backup is running, restart with new interval
    if (clientService.timer) {
      clearInterval(clientService.timer);
      clientService.timer = setInterval(async () => {
        await createBackup();
      }, interval);

      clientService.nextBackupTime = new Date(Date.now() + interval);
    }

    const settings = await getBackupSettings();

    return {
      success: true,
      message: "Backup interval updated",
      settings,
    };
  }
}

/**
 * Start auto-backup service
 */
export async function startAutoBackup(interval?: number): Promise<{
  success: boolean;
  message: string;
}> {
  const backupInterval = interval || DEFAULT_BACKUP_INTERVAL;

  if (isTauriApp()) {
    try {
      // Call Tauri command to start auto-backup
      await invoke("start_auto_backup", { interval: backupInterval });
      return {
        success: true,
        message: `Auto-backup started with ${(backupInterval / 60000).toFixed(
          1
        )} minute interval`,
      };
    } catch (error) {
      console.error("Failed to start auto-backup:", error);
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to start auto-backup",
      };
    }
  } else {
    // Web: Client-side auto-backup (not recommended, but available)
    if (clientService.timer) {
      clearInterval(clientService.timer);
    }

    clientService.currentInterval = backupInterval;
    clientService.timer = setInterval(async () => {
      await createBackup();
    }, backupInterval);

    clientService.isInitialized = true;
    clientService.nextBackupTime = new Date(Date.now() + backupInterval);

    return {
      success: true,
      message: "Client-side auto-backup started (limited functionality)",
    };
  }
}

/**
 * Stop auto-backup service
 */
export async function stopAutoBackup(): Promise<{
  success: boolean;
  message: string;
}> {
  if (isTauriApp()) {
    try {
      // Call Tauri command to stop auto-backup
      await invoke("stop_auto_backup");
      return {
        success: true,
        message: "Auto-backup stopped",
      };
    } catch (error) {
      console.error("Failed to stop auto-backup:", error);
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to stop auto-backup",
      };
    }
  } else {
    // Web: Stop client-side timer
    if (clientService.timer) {
      clearInterval(clientService.timer);
      clientService.timer = null;
      clientService.nextBackupTime = null;
      return {
        success: true,
        message: "Auto-backup stopped",
      };
    }
    return {
      success: false,
      message: "Auto-backup was not running",
    };
  }
}

/**
 * Check if backup is available in current environment
 */
export function isBackupAvailable(): boolean {
  return isTauriApp(); // Only available in desktop mode
}

/**
 * Get environment info for debugging
 */
export function getBackupEnvironmentInfo(): {
  environment: "tauri" | "web";
  backupAvailable: boolean;
  autoBackupSupported: boolean;
} {
  return {
    environment: isTauriApp() ? "tauri" : "web",
    backupAvailable: isBackupAvailable(),
    autoBackupSupported: isBackupAvailable(),
  };
}
