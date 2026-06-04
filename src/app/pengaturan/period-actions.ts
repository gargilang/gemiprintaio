"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  closePeriod,
  reopenPeriod,
  listAccountingPeriods,
} from "@/lib/services/accounting-periods-service";

export async function listAccountingPeriodsAction() {
  try {
    return await listAccountingPeriods();
  } catch (error) {
    console.error("Error in listAccountingPeriodsAction:", error);
    throw error;
  }
}

export async function closePeriodAction(input: {
  year: number;
  month: number;
  catatan?: string | null;
}) {
  try {
    const s = await requireAdminOrManager();
    return await closePeriod({ ...input, actor_id: s.uid });
  } catch (error) {
    console.error("Error in closePeriodAction:", error);
    throw error;
  }
}

export async function reopenPeriodAction(input: {
  year: number;
  month: number;
  alasan: string;
}) {
  try {
    await requireAdminOrManager();
    return await reopenPeriod(input);
  } catch (error) {
    console.error("Error in reopenPeriodAction:", error);
    throw error;
  }
}
