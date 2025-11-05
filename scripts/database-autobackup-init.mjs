/**
 * Auto-Backup Initialization for Next.js
 * This module starts the backup service when the app starts
 */

import {
  startAutoBackup,
  stopAutoBackup,
  getBackupInfo,
} from "./database-autobackup.mjs";

let isInitialized = false;

export function initAutoBackup() {
  if (isInitialized) {
    console.log("⚠️  Auto-backup already initialized");
    return;
  }

  console.log("🔧 Initializing auto-backup service...");
  startAutoBackup();
  isInitialized = true;

  // Cleanup on process exit
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

export { getBackupInfo, stopAutoBackup };
