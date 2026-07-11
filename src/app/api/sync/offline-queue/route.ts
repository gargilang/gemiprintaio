import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { SYNC_TABLES } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { limitOrPass, offlineQueueLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OFFLINE_BLOCKED = new Set([
  "profil",
  "kredensial",
  "keuangan",
  "audit_log",
]);
const ALLOWED = new Set(SYNC_TABLES.filter((t) => !OFFLINE_BLOCKED.has(t)));

type QueueOp = {
  table?: string;
  operation?: string;
  recordId?: string | null;
  data?: Record<string, unknown>;
  attempts?: number;
  nextRetryAt?: number;
  lastError?: string;
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.uid) {
    return apiError("Unauthorized", 401);
  }
  if (session.role === "demo") {
    return apiError("Akun demo tidak dapat melakukan perubahan data", 403);
  }

  const limited = await limitOrPass(
    offlineQueueLimiter,
    request,
    "offline-queue",
  );
  if (!limited.ok) {
    return apiError("Too many requests", 429);
  }

  let body: { queue?: QueueOp[] };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const queue = Array.isArray(body.queue) ? body.queue : [];
  if (queue.length === 0) {
    return NextResponse.json({ synced: 0, failed: 0, remaining: [] });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return apiError("Sync service unavailable", 503, e);
  }

  const remaining: QueueOp[] = [];
  let synced = 0;
  let failed = 0;

  for (const rawOp of queue) {
    const op = rawOp || {};
    const table = String(op.table || "");
    const operation = String(op.operation || "");
    const recordId = op.recordId ? String(op.recordId) : null;
    const payload = op.data ?? {};

    if (!table || !operation || !ALLOWED.has(table)) {
      if (table && OFFLINE_BLOCKED.has(table)) {
        console.warn(
          "[offline-queue] blocked sensitive table:",
          table,
          "uid:",
          session.uid,
        );
      }
      failed++;
      continue;
    }

    try {
      if (operation === "insert") {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
        synced++;
      } else if (operation === "update" && recordId) {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq("id", recordId);
        if (error) throw error;
        synced++;
      } else if (operation === "delete" && recordId) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq("id", recordId);
        if (error) throw error;
        synced++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error("[offline-queue] op failed:", table, operation, e);
      remaining.push({
        ...op,
        attempts: Number(op.attempts || 0) + 1,
        lastError: e instanceof Error ? e.message : "error",
      });
      failed++;
    }
  }

  return NextResponse.json({ synced, failed, remaining });
}
