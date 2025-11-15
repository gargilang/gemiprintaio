"use server";

/**
 * Server Actions for Reports Page
 */

import { getArchivedPeriods } from "@/lib/services/reports-service";

export async function getArchivedPeriodsAction() {
  try {
    return await getArchivedPeriods();
  } catch (error) {
    console.error("Error in getArchivedPeriodsAction:", error);
    throw error;
  }
}
