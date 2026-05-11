import { NextRequest, NextResponse } from "next/server";

import {
  getSyncStatus,
  triggerManualSync,
} from "@/lib/services/sync-operations-service";

export async function POST(_request: NextRequest) {
  try {
    console.log("🔄 Manual sync triggered");

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Supabase not configured. Please add credentials to .env.local",
        },
        { status: 503 }
      );
    }

    const result = await triggerManualSync();

    return NextResponse.json({
      success: result.success,
      message:
        result.message ||
        `Sync completed: ${result.synced} synced, ${result.failed} failed`,
      result: {
        synced: result.synced,
        conflicts: 0,
        errors: result.failed,
        timestamp: result.timestamp,
        details: [],
      },
    });
  } catch (error: unknown) {
    console.error("Manual sync error:", error);
    return NextResponse.json(
      { success: false, error: "Manual sync gagal" },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    const status = await getSyncStatus();

    return NextResponse.json({
      success: true,
      status: {
        cloudBackup: status.cloudBackup,
        localDb: status.localDb,
        pendingChanges: status.pendingChanges,
        lastSyncAt: status.lastSyncAt,
      },
    });
  } catch (error) {
    console.error("Get sync status error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
