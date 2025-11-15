/**
 * ⚠️ DEPRECATED - DO NOT USE IN NEW CODE ⚠️
 *
 * This API route has been migrated to sync-operations-service.ts
 * Use the following functions instead:
 * - startAutoSync(intervalMinutes) - to start auto-sync
 * - stopAutoSync() - to stop auto-sync
 * - getAutoSyncSettings() - to get current settings
 *
 * This route will be removed after full migration verification.
 *
 * @deprecated Use src/lib/services/sync-operations-service.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { startAutoSync, stopAutoSync, getSyncStats } from "@/lib/sync-service";

/**
 * Auto-Sync Control API
 *
 * POST: Start/stop auto-sync with custom interval
 * GET: Get auto-sync status
 */
export async function POST(request: NextRequest) {
  try {
    const { action, intervalMinutes } = await request.json();

    switch (action) {
      case "start":
        const interval = intervalMinutes || 20; // Default 20 minutes
        startAutoSync(interval);
        return NextResponse.json({
          success: true,
          message: `Auto-sync started with ${interval} minute interval`,
          intervalMinutes: interval,
        });

      case "stop":
        stopAutoSync();
        return NextResponse.json({
          success: true,
          message: "Auto-sync stopped",
        });

      default:
        return NextResponse.json(
          { success: false, error: "Invalid action. Use: start or stop" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Auto-sync control error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const stats = getSyncStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
