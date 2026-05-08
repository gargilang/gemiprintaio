import { NextRequest, NextResponse } from "next/server";
import {
  getSyncStatus,
  getRolloutMetrics,
  processSyncQueue,
  triggerManualSync,
  triggerPullFromCloud,
  triggerSyncCycle,
} from "@/lib/services/sync-operations-service";

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    switch (action) {
      case "push":
        const pushResult = await triggerManualSync();
        return NextResponse.json(pushResult);

      case "pull":
        const pullResult = await triggerPullFromCloud();
        return NextResponse.json(pullResult);

      case "sync-cycle":
        return NextResponse.json(await triggerSyncCycle());

      case "stats":
        return NextResponse.json(await getSyncStatus());

      case "metrics":
        return NextResponse.json(await getRolloutMetrics());

      case "process-queue":
        // Process pending sync queue (auto-sync when online)
        const result = await processSyncQueue();
        return NextResponse.json(result);

      default:
        return NextResponse.json(
          {
            error:
              "Invalid action. Use: push, pull, sync-cycle, stats, metrics, or process-queue",
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = await getSyncStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
