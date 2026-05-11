import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export type AuditInput = {
  userId: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("audit_log").insert({
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      details: input.details ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) console.error("[audit] insert failed:", error);
  } catch (e) {
    console.error("[audit] skipped:", e);
  }
}
