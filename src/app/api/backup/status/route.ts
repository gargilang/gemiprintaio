/**
 * API Route: /api/backup/status
 * Get auto-backup status and info
 */

import { NextResponse } from "next/server";

// @ts-ignore - ESM import from scripts folder
import {
  initAutoBackup,
  getBackupInfo,
} from "../../../../../scripts/database-autobackup-init.mjs";

// Initialize auto-backup when this route is first loaded
initAutoBackup();

export async function GET() {
  try {
    const backupInfo = getBackupInfo();

    return NextResponse.json({
      success: true,
      autoBackupEnabled: true,
      backup: backupInfo,
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
