/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 *
 * This API route has been migrated to backup-service.ts
 * Use getBackupStatus() function instead.
 *
 * This route will be removed after full migration verification.
 *
 * @deprecated Use src/lib/services/backup-service.ts
 */

/**
 * API Route: /api/backup/status
 * Get auto-backup status and info
 */

import { NextResponse } from "next/server";
import {
  initializeBackupService,
  getBackupInfo,
  getBackupStatus,
} from "@/lib/database-backup";

// Initialize auto-backup when this route is first loaded
// This ensures backup service starts when app is accessed
if (typeof window === "undefined") {
  // Only run on server-side
  initializeBackupService();
}

export async function GET() {
  try {
    const backupInfo = getBackupInfo();
    const status = getBackupStatus();

    return NextResponse.json({
      success: true,
      autoBackupEnabled: status.isRunning,
      backup: backupInfo,
      status: {
        isRunning: status.isRunning,
        currentInterval: status.currentInterval,
        currentIntervalMinutes: status.currentIntervalMinutes,
        lastBackupTime: status.lastBackupTime,
        nextBackupTime: status.nextBackupTime,
      },
    });
  } catch (error) {
    console.error("Error getting backup status:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get backup status",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
