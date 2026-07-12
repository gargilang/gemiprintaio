"use server";

import { requireSession } from "@/lib/auth-guard-server";
import { getAuditLog } from "@/lib/services/audit-log-service";

export async function getAuditLogAction(filters: {
  limit?: number;
  from?: string;
  to?: string;
} = {}) {
  try {
    // Baca-saja: cukup sesi aktif. Menu sudah memfilter tampilan berdasarkan
    // role (ADMIN_ONLY mencakup demo); requireAdminOrManager memblokir demo
    // padahal akun demo seharusnya bisa melihat log.
    await requireSession();
    return await getAuditLog(filters);
  } catch (error) {
    console.error("Error in getAuditLogAction:", error);
    throw error;
  }
}
