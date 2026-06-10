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
  setOrderStatusSelesaiCascade,
  updateSaleCustomer,
} from "@/lib/services/production-service";
import {
  requireProductionInventoryRole,
  requireSession,
} from "@/lib/auth-guard-server";
import {
  updateItemStatusSchema,
  updateSaleCustomerSchema,
} from "@/lib/schemas/produksi";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { getPelanggan } from "@/lib/services/customers-service";

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
  status: string
) {
  try {
    await requireProductionInventoryRole();
    return await updateProductionOrderStatus(orderId, status as any);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateProductionStatusAction:", error);
    throw error;
  }
}

export async function updateProductionItemStatusAction(
  itemId: string,
  data: { status: string; operator_id?: string }
) {
  try {
    const s = await requireProductionInventoryRole();
    const parsed = updateItemStatusSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Status item tidak valid");
    }
    return await updateProductionItemStatus(itemId, {
      status: parsed.data.status as any,
      operator_id: parsed.data.operator_id || s.uid,
    });
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateProductionItemStatusAction:", error);
    throw error;
  }
}

export async function setOrderStatusSelesaiCascadeAction(orderId: string) {
  try {
    await requireProductionInventoryRole();
    return await setOrderStatusSelesaiCascade(orderId);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in setOrderStatusSelesaiCascadeAction:", error);
    throw error;
  }
}

export async function updateSaleCustomerAction(
  penjualanId: string,
  data: { pelanggan_id?: string | null; pelanggan_nama_snapshot?: string | null }
) {
  try {
    await requireSession();
    const parsed = updateSaleCustomerSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || "Data nama tidak valid");
    }
    return await updateSaleCustomer(penjualanId, parsed.data);
  } catch (error) {
    if (error instanceof AuthGuardError) throw error;
    console.error("Error in updateSaleCustomerAction:", error);
    throw error;
  }
}

export async function getPelangganRingkasAction() {
  try {
    const list = await getPelanggan();
    return list.map((p) => ({ id: p.id, nama: p.nama }));
  } catch (error) {
    console.error("Error in getPelangganRingkasAction:", error);
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
