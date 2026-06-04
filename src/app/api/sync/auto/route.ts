import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  startAutoSync,
  stopAutoSync,
  getSyncStatus,
} from "@/lib/services/sync-operations-service";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";

/**
 * Auto-Sync Control API
 *
 * POST: Start/stop auto-sync with custom interval
 * GET: Get auto-sync status
 */
export async function POST(request: NextRequest) {
  try {
    await requireSession();
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
  } catch (error: unknown) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
    return apiError("Auto-sync control failed", 500, error);
  }
}

export async function GET() {
  try {
    const stats = await getSyncStatus();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: unknown) {
    return apiError("Auto-sync status failed", 500, error);
  }
}
