"use server";

/**
 * Server Actions for Reports Page
 */

import { getFormalAccountingReport } from "@/lib/services/reports-service";

export async function getFormalAccountingReportAction(data: {
  startDate: string;
  endDate: string;
}) {
  try {
    return await getFormalAccountingReport(data);
  } catch (error) {
    console.error("Error in getFormalAccountingReportAction:", error);
    throw error;
  }
}
