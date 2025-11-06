/**
 * Database Auto-Backup Service
 * Built-in TypeScript implementation for automatic database backups
 * Supports configurable intervals with performance-conscious limits
 */

import { existsSync, copyFileSync, statSync } from "fs";
import { join } from "path";

// Minimum interval: 30 seconds (prevents performance degradation)
// Maximum interval: 24 hours
export const MIN_BACKUP_INTERVAL = 30000; // 30 seconds
export const MAX_BACKUP_INTERVAL = 86400000; // 24 hours
export const DEFAULT_BACKUP_INTERVAL = 600000; // 10 minutes

// Preset intervals for UI
export const BACKUP_INTERVAL_PRESETS = {
  "30s": 30000,
  "1m": 60000,
  "5m": 300000,
  "10m": 600000,
  "30m": 1800000,
  "1h": 3600000,
} as const;

interface BackupInfo {
  exists: boolean;
  path?: string;
  size?: number;
  sizeMB?: string;
  lastModified?: Date;
  lastModifiedFormatted?: string;
  error?: string;
  message?: string;
}

interface BackupService {
  timer: NodeJS.Timeout | null;
  isBackingUp: boolean;
  currentInterval: number;
  lastBackupTime: Date | null;
  nextBackupTime: Date | null;
  isInitialized: boolean;
}

const DB_PATH = join(process.cwd(), "database", "gemiprint.db");
const BACKUP_PATH = join(process.cwd(), "database", "gemiprint.db.auto-backup");

const service: BackupService = {
  timer: null,
  isBackingUp: false,
  currentInterval: DEFAULT_BACKUP_INTERVAL,
  lastBackupTime: null,
  nextBackupTime: null,
  isInitialized: false,
};

/**
 * Create a backup of the database
 * @returns Success status
 */
export function createBackup(): boolean {
  if (service.isBackingUp) {
    console.log("⏳ Backup already in progress, skipping...");
    return false;
  }

  if (!existsSync(DB_PATH)) {
    console.error("❌ Database file not found:", DB_PATH);
    return false;
  }

  try {
    service.isBackingUp = true;
    const startTime = Date.now();

    // Get file size for logging
    const stats = statSync(DB_PATH);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Copy database file (atomic operation)
    copyFileSync(DB_PATH, BACKUP_PATH);

    const duration = Date.now() - startTime;
    const timestamp = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });

    service.lastBackupTime = new Date();
    service.nextBackupTime = new Date(Date.now() + service.currentInterval);

    console.log(
      `✅ [${timestamp}] Auto-backup created successfully (${fileSizeMB}MB in ${duration}ms)`
    );

    return true;
  } catch (err: any) {
    console.error("❌ Backup failed:", err.message);
    return false;
  } finally {
    service.isBackingUp = false;
  }
}

/**
 * Start auto-backup service with specified interval
 * @param interval Backup interval in milliseconds (default: 10 minutes)
 * @returns Success status
 */
export function startAutoBackup(interval?: number): boolean {
  // Validate and set interval
  const newInterval = interval || service.currentInterval;

  if (newInterval < MIN_BACKUP_INTERVAL) {
    console.warn(
      `⚠️ Interval too short (${newInterval}ms). Using minimum: ${MIN_BACKUP_INTERVAL}ms`
    );
    service.currentInterval = MIN_BACKUP_INTERVAL;
  } else if (newInterval > MAX_BACKUP_INTERVAL) {
    console.warn(
      `⚠️ Interval too long (${newInterval}ms). Using maximum: ${MAX_BACKUP_INTERVAL}ms`
    );
    service.currentInterval = MAX_BACKUP_INTERVAL;
  } else {
    service.currentInterval = newInterval;
  }

  // Stop any existing timer
  stopAutoBackup(false);

  const intervalMinutes = (service.currentInterval / 1000 / 60).toFixed(1);
  console.log(
    `🔄 Auto-backup service started (interval: ${intervalMinutes} minutes)`
  );

  // Create initial backup
  createBackup();

  // Set up periodic backup
  service.timer = setInterval(() => {
    createBackup();
  }, service.currentInterval);

  service.isInitialized = true;

  return true;
}

/**
 * Stop auto-backup service
 * @param logMessage Whether to log the stop message
 * @returns Success status
 */
export function stopAutoBackup(logMessage: boolean = true): boolean {
  if (service.timer) {
    clearInterval(service.timer);
    service.timer = null;
    service.nextBackupTime = null;
    if (logMessage) {
      console.log("⏹️  Auto-backup service stopped");
    }
    return true;
  }
  return false;
}

/**
 * Update backup interval (restart service with new interval)
 * @param newInterval New interval in milliseconds
 * @returns Success status
 */
export function updateBackupInterval(newInterval: number): boolean {
  if (newInterval < MIN_BACKUP_INTERVAL || newInterval > MAX_BACKUP_INTERVAL) {
    console.error(
      `❌ Invalid interval: ${newInterval}ms. Must be between ${MIN_BACKUP_INTERVAL}ms and ${MAX_BACKUP_INTERVAL}ms`
    );
    return false;
  }

  const wasRunning = service.timer !== null;

  if (wasRunning) {
    // Restart with new interval
    return startAutoBackup(newInterval);
  } else {
    // Just update the interval, don't start
    service.currentInterval = newInterval;
    return true;
  }
}

/**
 * Get backup file information
 * @returns Backup info object
 */
export function getBackupInfo(): BackupInfo {
  if (!existsSync(BACKUP_PATH)) {
    return {
      exists: false,
      message: "No backup found",
    };
  }

  try {
    const stats = statSync(BACKUP_PATH);
    return {
      exists: true,
      path: BACKUP_PATH,
      size: stats.size,
      sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      lastModified: stats.mtime,
      lastModifiedFormatted: stats.mtime.toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      }),
    };
  } catch (err: any) {
    return {
      exists: false,
      error: err.message,
    };
  }
}

/**
 * Get current backup service status
 * @returns Service status information
 */
export function getBackupStatus() {
  return {
    isRunning: service.timer !== null,
    isInitialized: service.isInitialized,
    currentInterval: service.currentInterval,
    currentIntervalMinutes: (service.currentInterval / 1000 / 60).toFixed(1),
    lastBackupTime: service.lastBackupTime,
    nextBackupTime: service.nextBackupTime,
    isBackingUp: service.isBackingUp,
  };
}

/**
 * Restore database from backup
 * @returns Success status
 */
export function restoreFromBackup(): boolean {
  if (!existsSync(BACKUP_PATH)) {
    console.error("❌ Backup file not found");
    return false;
  }

  try {
    // Create a safety backup of current db before restoring
    const safetyBackup = join(
      process.cwd(),
      "database",
      "gemiprint.db.before-restore"
    );
    if (existsSync(DB_PATH)) {
      copyFileSync(DB_PATH, safetyBackup);
      console.log("💾 Safety backup created:", safetyBackup);
    }

    // Restore from backup
    copyFileSync(BACKUP_PATH, DB_PATH);
    console.log("✅ Database restored from backup");
    return true;
  } catch (err: any) {
    console.error("❌ Restore failed:", err.message);
    return false;
  }
}

/**
 * Initialize backup service (call this once on app startup)
 * @param interval Optional custom interval
 */
export function initializeBackupService(interval?: number): void {
  if (service.isInitialized) {
    console.log("⚠️  Auto-backup service already initialized");
    return;
  }

  console.log("🔧 Initializing auto-backup service...");
  startAutoBackup(interval);

  // Cleanup on process exit
  if (typeof process !== "undefined") {
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down auto-backup service...");
      stopAutoBackup();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n🛑 Shutting down auto-backup service...");
      stopAutoBackup();
      process.exit(0);
    });
  }
}
