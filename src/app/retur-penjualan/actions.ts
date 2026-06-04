"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  createSalesReturn,
  getSalesReturnInit,
} from "@/lib/services/return-service";

export async function getSalesReturnInitAction() {
  return getSalesReturnInit();
}

export async function createSalesReturnAction(
  input: Parameters<typeof createSalesReturn>[0]
) {
  const s = await requireAdminOrManager();
  return createSalesReturn({ ...input, actor_id: s.uid });
}

