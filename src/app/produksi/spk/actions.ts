"use server";

/**
 * Server Actions for Production Page
 */

import {
  getProductionOrders,
  getProductionOrderById,
  updateProductionOrderStatus,
  updateProductionItemStatus,
  getRollVariantsForProductionItem,
  postProductionMaterialConsumption,
  voidProductionMaterialConsumption,
  deleteProductionOrder,
} from "@/lib/services/production-service";
import { requireProductionInventoryRole } from "@/lib/auth-guard-server";

export async function getProductionOrdersAction() {
  try {
    return await getProductionOrders();
  } catch (error) {
    console.error("Error in getProductionOrdersAction:", error);
    throw error;
  }
}

export async function getProductionOrderByIdAction(id: string) {
  try {
    return await getProductionOrderById(id);
  } catch (error) {
    console.error("Error in getProductionOrderByIdAction:", error);
    throw error;
  }
}

export async function updateProductionStatusAction(
  orderId: string,
  status: "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN"
) {
  try {
    return await updateProductionOrderStatus(orderId, status);
  } catch (error) {
    console.error("Error in updateProductionStatusAction:", error);
    throw error;
  }
}

export async function updateProductionItemStatusAction(
  itemId: string,
  data: {
    status: "MENUNGGU" | "PRINTING" | "FINISHING" | "SELESAI";
    operator_id?: string;
  }
) {
  try {
    return await updateProductionItemStatus(itemId, data);
  } catch (error) {
    console.error("Error in updateProductionItemStatusAction:", error);
    throw error;
  }
}

export async function getRollVariantsForProductionItemAction(itemId: string) {
  try {
    return await getRollVariantsForProductionItem(itemId);
  } catch (error) {
    console.error("Error in getRollVariantsForProductionItemAction:", error);
    throw error;
  }
}

export async function postProductionMaterialConsumptionAction(data: {
  item_produksi_id: string;
  roll_variant_id: string;
  linear_used_m?: number | null;
  operator_id?: string | null;
  catatan?: string | null;
}) {
  try {
    const s = await requireProductionInventoryRole();
    return await postProductionMaterialConsumption({
      ...data,
      operator_id: data.operator_id || s.uid,
    });
  } catch (error) {
    console.error("Error in postProductionMaterialConsumptionAction:", error);
    throw error;
  }
}

export async function voidProductionMaterialConsumptionAction(
  consumptionId: string,
  reason?: string,
  actorId?: string | null
) {
  try {
    const s = await requireProductionInventoryRole();
    return await voidProductionMaterialConsumption(consumptionId, reason, actorId || s.uid);
  } catch (error) {
    console.error("Error in voidProductionMaterialConsumptionAction:", error);
    throw error;
  }
}

export async function deleteProductionOrderAction(orderId: string) {
  try {
    return await deleteProductionOrder(orderId);
  } catch (error) {
    console.error("Error in deleteProductionOrderAction:", error);
    throw error;
  }
}
