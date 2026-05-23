"use server";

/**
 * Server Actions for Purchases Page
 */

import { createVendor, getVendors } from "@/lib/services/vendors-service";
import { createMaterial, getMaterials } from "@/lib/services/materials-service";
import {
  createPurchase,
  updatePurchase,
  getPurchases,
  getInitData,
  deletePurchase,
  voidPurchase,
  revertPayment,
  getDebts,
  payDebt,
  createPurchaseReturn,
} from "@/lib/services/purchases-service";
import {
  createInventoryAdjustment,
  getInventoryMovements,
} from "@/lib/services/inventory-service";
import {
  getCategories,
  getSubcategories,
  getUnits,
} from "@/lib/services/master-service";

export async function createVendorAction(data: any) {
  try {
    return await createVendor(data);
  } catch (error) {
    console.error("Error in createVendorAction:", error);
    throw error;
  }
}

export async function createMaterialAction(data: any) {
  try {
    return await createMaterial(data);
  } catch (error) {
    console.error("Error in createMaterialAction:", error);
    throw error;
  }
}

export async function createPurchaseAction(data: any) {
  try {
    return await createPurchase(data);
  } catch (error) {
    console.error("Error in createPurchaseAction:", error);
    throw error;
  }
}

export async function updatePurchaseAction(id: string, data: any) {
  try {
    return await updatePurchase(id, data);
  } catch (error) {
    console.error("Error in updatePurchaseAction:", error);
    throw error;
  }
}

export async function getInitDataAction() {
  try {
    return await getInitData();
  } catch (error) {
    console.error("Error in getInitDataAction:", error);
    throw error;
  }
}

export async function getPurchasesAction() {
  try {
    return await getPurchases();
  } catch (error) {
    console.error("Error in getPurchasesAction:", error);
    throw error;
  }
}

export async function getMaterialsAction() {
  try {
    return await getMaterials();
  } catch (error) {
    console.error("Error in getMaterialsAction:", error);
    throw error;
  }
}

export async function getVendorsAction() {
  try {
    return await getVendors();
  } catch (error) {
    console.error("Error in getVendorsAction:", error);
    throw error;
  }
}

export async function getCategoriesAction() {
  try {
    return await getCategories();
  } catch (error) {
    console.error("Error in getCategoriesAction:", error);
    throw error;
  }
}

export async function getSubcategoriesAction() {
  try {
    return await getSubcategories();
  } catch (error) {
    console.error("Error in getSubcategoriesAction:", error);
    throw error;
  }
}

export async function getUnitsAction() {
  try {
    return await getUnits();
  } catch (error) {
    console.error("Error in getUnitsAction:", error);
    throw error;
  }
}

export async function deletePurchaseAction(id: string) {
  try {
    return await deletePurchase(id);
  } catch (error) {
    console.error("Error in deletePurchaseAction:", error);
    throw error;
  }
}

export async function voidPurchaseAction(
  id: string,
  reason = "Pembelian dibatalkan"
) {
  try {
    return await voidPurchase(id, reason);
  } catch (error) {
    console.error("Error in voidPurchaseAction:", error);
    throw error;
  }
}

export async function createPurchaseReturnAction(input: {
  purchase_id: string;
  reason: string;
  actor_id?: string | null;
  items: Array<{ item_pembelian_id: string; qty: number }>;
}) {
  try {
    return await createPurchaseReturn(input);
  } catch (error) {
    console.error("Error in createPurchaseReturnAction:", error);
    throw error;
  }
}

export async function createInventoryAdjustmentAction(data: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
}) {
  try {
    return await createInventoryAdjustment(data);
  } catch (error) {
    console.error("Error in createInventoryAdjustmentAction:", error);
    throw error;
  }
}

export async function getInventoryMovementsAction(filters: {
  barang_id?: string;
  source_id?: string;
  source_type?: string;
}) {
  try {
    return await getInventoryMovements(filters);
  } catch (error) {
    console.error("Error in getInventoryMovementsAction:", error);
    throw error;
  }
}

export async function revertPaymentAction(id: string) {
  try {
    return await revertPayment(id);
  } catch (error) {
    console.error("Error in revertPaymentAction:", error);
    throw error;
  }
}

export async function getDebtsAction() {
  try {
    return await getDebts();
  } catch (error) {
    console.error("Error in getDebtsAction:", error);
    throw error;
  }
}

export async function payDebtAction(data: {
  purchase_id: string;
  jumlah_bayar: number;
  tanggal_bayar: string;
  metode_pembayaran: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}) {
  try {
    return await payDebt(data);
  } catch (error) {
    console.error("Error in payDebtAction:", error);
    throw error;
  }
}
