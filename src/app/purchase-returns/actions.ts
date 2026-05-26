"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  createPurchaseReturn,
  getPurchaseReturnInit,
} from "@/lib/services/return-service";

export async function getPurchaseReturnInitAction() {
  return getPurchaseReturnInit();
}

export async function createPurchaseReturnAction(
  input: Parameters<typeof createPurchaseReturn>[0]
) {
  const s = await requireAdminOrManager();
  return createPurchaseReturn({ ...input, actor_id: s.uid });
}

