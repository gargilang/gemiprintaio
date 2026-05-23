"use server";

import { getPpnReport } from "@/lib/services/ppn-report-service";

export async function getPpnReportAction(input: {
  year: number;
  month: number;
}) {
  try {
    return await getPpnReport(input);
  } catch (error) {
    console.error("Error in getPpnReportAction:", error);
    throw error;
  }
}
