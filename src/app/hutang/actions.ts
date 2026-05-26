"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  getDebts,
  payDebt,
  revertPayment,
} from "@/lib/services/purchases-service";

export async function getDebtsAction() {
  return getDebts();
}

export async function payDebtAction(input: Parameters<typeof payDebt>[0]) {
  const s = await requireAdminOrManager();
  return payDebt({ ...input, dibuat_oleh: s.uid });
}

export async function revertDebtPaymentAction(purchaseId: string) {
  await requireAdminOrManager();
  return revertPayment(purchaseId);
}

