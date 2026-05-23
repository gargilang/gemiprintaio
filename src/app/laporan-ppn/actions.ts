"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { getPpnReport } from "@/lib/services/ppn-report-service";

export async function getPpnReportAction(input: {
  year: number;
  month: number;
}) {
  try {
    await requireAdminOrManager();
    return await getPpnReport(input);
  } catch (error) {
    console.error("Error in getPpnReportAction:", error);
    throw error;
  }
}
