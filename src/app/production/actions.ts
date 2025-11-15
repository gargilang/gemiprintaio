"use server";

/**
 * Server Actions for Production Page
 */

import {
  getProductionOrders,
  getProductionOrderById,
  updateProductionOrderStatus,
  updateProductionItemStatus,
  deleteProductionOrder,
  type ProductionOrder,
} from "@/lib/services/production-service";

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

export async function deleteProductionOrderAction(orderId: string) {
  try {
    return await deleteProductionOrder(orderId);
  } catch (error) {
    console.error("Error in deleteProductionOrderAction:", error);
    throw error;
  }
}
