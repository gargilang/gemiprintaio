/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 *
 * This API route has been migrated to backup-service.ts
 * Use getBackupSettings() and updateBackupInterval() functions instead.
 *
 * This route will be removed after full migration verification.
 *
 * @deprecated Use src/lib/services/backup-service.ts
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getBackupStatus,
  updateBackupInterval,
  MIN_BACKUP_INTERVAL,
  MAX_BACKUP_INTERVAL,
  BACKUP_INTERVAL_PRESETS,
} from "@/lib/database-backup";

/**
 * GET /api/backup/settings
 * Get current backup settings
 */
export async function GET() {
  try {
    const status = getBackupStatus();

    return NextResponse.json({
      success: true,
      settings: {
        currentInterval: status.currentInterval,
        currentIntervalMinutes: status.currentIntervalMinutes,
        isRunning: status.isRunning,
        lastBackupTime: status.lastBackupTime,
        nextBackupTime: status.nextBackupTime,
        minInterval: MIN_BACKUP_INTERVAL,
        maxInterval: MAX_BACKUP_INTERVAL,
        presets: BACKUP_INTERVAL_PRESETS,
      },
    });
  } catch (error: any) {
    console.error("Get backup settings error:", error);
    return NextResponse.json(
      { error: "Failed to get backup settings", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/backup/settings
 * Update backup interval
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { interval } = body;

    if (typeof interval !== "number") {
      return NextResponse.json(
        { error: "Interval must be a number (milliseconds)" },
        { status: 400 }
      );
    }

    if (interval < MIN_BACKUP_INTERVAL || interval > MAX_BACKUP_INTERVAL) {
      return NextResponse.json(
        {
          error: `Interval must be between ${MIN_BACKUP_INTERVAL}ms (${
            MIN_BACKUP_INTERVAL / 1000
          }s) and ${MAX_BACKUP_INTERVAL}ms (${
            MAX_BACKUP_INTERVAL / 1000 / 60 / 60
          }h)`,
        },
        { status: 400 }
      );
    }

    const success = updateBackupInterval(interval);

    if (!success) {
      return NextResponse.json(
        { error: "Failed to update backup interval" },
        { status: 500 }
      );
    }

    const status = getBackupStatus();

    return NextResponse.json({
      success: true,
      message: "Backup interval updated successfully",
      settings: {
        currentInterval: status.currentInterval,
        currentIntervalMinutes: status.currentIntervalMinutes,
        nextBackupTime: status.nextBackupTime,
      },
    });
  } catch (error: any) {
    console.error("Update backup settings error:", error);
    return NextResponse.json(
      { error: "Failed to update backup settings", details: error.message },
      { status: 500 }
    );
  }
}
