"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { getMaterials } from "@/lib/services/materials-service";
import { getVendors } from "@/lib/services/vendors-service";
import {
  createPurchaseOrder,
  getPurchaseOrders,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
  type PurchaseOrderStatus,
  type UpsertPurchaseOrderInput,
} from "@/lib/services/purchase-order-service";

export async function getPurchaseOrdersInitAction() {
  const [purchaseOrders, materials, vendors] = await Promise.all([
    getPurchaseOrders(),
    getMaterials(),
    getVendors(),
  ]);
  return { purchaseOrders, materials, vendors };
}

export async function createPurchaseOrderAction(input: UpsertPurchaseOrderInput) {
  const s = await requireAdminOrManager();
  return createPurchaseOrder({ ...input, dibuat_oleh: s.uid });
}

export async function updatePurchaseOrderStatusAction(
  id: string,
  status: PurchaseOrderStatus
) {
  await requireAdminOrManager();
  return updatePurchaseOrderStatus(id, status);
}

export async function receivePurchaseOrderAction(
  input: Parameters<typeof receivePurchaseOrder>[0]
) {
  const s = await requireAdminOrManager();
  return receivePurchaseOrder({
    ...input,
    dibuat_oleh: s.uid,
    diterima_oleh: input.diterima_oleh || s.uid,
  });
}

