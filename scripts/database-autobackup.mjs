/**
 * Auto-Backup Service for Database
 * Creates periodic backups of gemiprint.db
 * Works in both development and production (Tauri)
 */

import { existsSync, copyFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "gemiprint.db");
const BACKUP_PATH = path.join(__dirname, "gemiprint.db.auto-backup");

// Backup interval in milliseconds
// Default: 10 minutes (600000ms)
// You can adjust this:
// - 5 minutes = 300000
// - 15 minutes = 900000
// - 30 minutes = 1800000
const BACKUP_INTERVAL = 600000; // 10 minutes

let backupTimer = null;
let isBackingUp = false;

/**
 * Create a backup of the database
 */
export function createBackup() {
  if (isBackingUp) {
    console.log("⏳ Backup already in progress, skipping...");
    return false;
  }

  if (!existsSync(DB_PATH)) {
    console.error("❌ Database file not found:", DB_PATH);
    return false;
  }

  try {
    isBackingUp = true;
    const startTime = Date.now();

    // Get file size for logging
    const stats = statSync(DB_PATH);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Copy database file
    copyFileSync(DB_PATH, BACKUP_PATH);

    const duration = Date.now() - startTime;
    const timestamp = new Date().toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
    });

    console.log(
      `✅ [${timestamp}] Auto-backup created successfully (${fileSizeMB}MB in ${duration}ms)`
    );

    return true;
  } catch (err) {
    console.error("❌ Backup failed:", err.message);
    return false;
  } finally {
    isBackingUp = false;
  }
}

/**
 * Start auto-backup service
 */
export function startAutoBackup() {
  // Stop any existing timer
  stopAutoBackup();

  console.log(
    `🔄 Auto-backup service started (interval: ${
      BACKUP_INTERVAL / 1000 / 60
    } minutes)`
  );

  // Create initial backup
  createBackup();

  // Set up periodic backup
  backupTimer = setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL);

  return true;
}

/**
 * Stop auto-backup service
 */
export function stopAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
    console.log("⏹️  Auto-backup service stopped");
    return true;
  }
  return false;
}

/**
 * Get backup info
 */
export function getBackupInfo() {
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
  } catch (err) {
    return {
      exists: false,
      error: err.message,
    };
  }
}

/**
 * Restore from backup
 */
export function restoreFromBackup() {
  if (!existsSync(BACKUP_PATH)) {
    console.error("❌ Backup file not found");
    return false;
  }

  try {
    // Create a safety backup of current db before restoring
    const safetyBackup = path.join(__dirname, "gemiprint.db.before-restore");
    if (existsSync(DB_PATH)) {
      copyFileSync(DB_PATH, safetyBackup);
      console.log("💾 Safety backup created:", safetyBackup);
    }

    // Restore from backup
    copyFileSync(BACKUP_PATH, DB_PATH);
    console.log("✅ Database restored from backup");
    return true;
  } catch (err) {
    console.error("❌ Restore failed:", err.message);
    return false;
  }
}

// If running as standalone script
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const command = process.argv[2];

  switch (command) {
    case "backup":
      console.log("📦 Creating manual backup...");
      createBackup();
      break;

    case "info":
      console.log("ℹ️  Backup information:");
      console.log(getBackupInfo());
      break;

    case "restore":
      console.log("⚠️  Restoring from backup...");
      restoreFromBackup();
      break;

    case "start":
      console.log("🚀 Starting auto-backup service...");
      startAutoBackup();
      // Keep process alive
      process.on("SIGINT", () => {
        stopAutoBackup();
        process.exit(0);
      });
      break;

    default:
      console.log("Usage:");
      console.log("  node backup-service.mjs backup   - Create manual backup");
      console.log("  node backup-service.mjs info     - Show backup info");
      console.log("  node backup-service.mjs restore  - Restore from backup");
      console.log(
        "  node backup-service.mjs start    - Start auto-backup service"
      );
  }
}
