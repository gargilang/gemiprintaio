import { NextRequest, NextResponse } from "next/server";
import { syncToCloud, pullFromCloud, getSyncStats } from "@/lib/sync-service";
import { processSyncQueue } from "@/lib/services/sync-operations-service";

export async function POST(request: NextRequest) {
  try {
    const { action, tables } = await request.json();

    switch (action) {
      case "push":
        // Push local changes to cloud
        const pushResult = await syncToCloud();
        return NextResponse.json(pushResult);

      case "pull":
        // Pull data from cloud to local
        const pullResult = await pullFromCloud(tables);
        return NextResponse.json(pullResult);

      case "stats":
        // Get sync statistics
        const stats = getSyncStats();
        return NextResponse.json(stats);

      case "process-queue":
        // Process pending sync queue (auto-sync when online)
        const result = await processSyncQueue();
        return NextResponse.json(result);

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: push, pull, stats, or process-queue" },
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
    const stats = getSyncStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
