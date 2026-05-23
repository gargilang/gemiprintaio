"use server";

import { getAuditLog } from "@/lib/services/audit-log-service";

export async function getAuditLogAction(filters: {
  limit?: number;
  from?: string;
  to?: string;
} = {}) {
  try {
    return await getAuditLog(filters);
  } catch (error) {
    console.error("Error in getAuditLogAction:", error);
    throw error;
  }
}
