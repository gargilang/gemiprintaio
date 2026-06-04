import { NextRequest, NextResponse } from "next/server";
import {
  getSyncStatus,
  getRolloutMetrics,
  processSyncQueue,
  triggerManualSync,
  triggerPullFromCloud,
  triggerSyncCycle,
} from "@/lib/services/sync-operations-service";
import { apiError } from "@/lib/api-error";
import { limitOrPass, syncApiLimiter } from "@/lib/rate-limit";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";

export async function POST(request: NextRequest) {
  try {
    await requireSession();
    const limited = await limitOrPass(syncApiLimiter, request, "sync-post");
    if (!limited.ok) {
      return apiError("Too many requests", 429);
    }

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
  } catch (error: unknown) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
    console.error("Sync API error:", error);
    return apiError("Sync gagal", 500, error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const limited = await limitOrPass(syncApiLimiter, request, "sync-get");
    if (!limited.ok) {
      return apiError("Too many requests", 429);
    }
    const status = await getSyncStatus();
    return NextResponse.json(status);
  } catch (error: unknown) {
    return apiError("Sync gagal", 500, error);
  }
}
