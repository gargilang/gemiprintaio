"use server";

/**
 * Server Actions for Materials Page
 */

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  type Material,
} from "@/lib/services/materials-service";
import {
  createInventoryAdjustment,
  getInventoryMovements,
  createWasteMovement,
  getRollVariants,
  convertRollVariant,
} from "@/lib/services/inventory-service";

export async function getMaterialsAction() {
  try {
    return await getMaterials();
  } catch (error) {
    console.error("Error in getMaterialsAction:", error);
    throw error;
  }
}

export async function getMaterialByIdAction(id: string) {
  try {
    return await getMaterialById(id);
  } catch (error) {
    console.error("Error in getMaterialByIdAction:", error);
    throw error;
  }
}

export async function createMaterialWithUnitPricesAction(data: any) {
  try {
    return await createMaterial(data);
  } catch (error) {
    console.error("Error in createMaterialWithUnitPricesAction:", error);
    throw error;
  }
}

export async function updateMaterialWithUnitPricesAction(
  id: string,
  data: any,
) {
  try {
    return await updateMaterial(id, data);
  } catch (error) {
    console.error("Error in updateMaterialWithUnitPricesAction:", error);
    throw error;
  }
}

export async function deleteMaterialAction(id: string) {
  try {
    return await deleteMaterial(id);
  } catch (error) {
    console.error("Error in deleteMaterialAction:", error);
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

export async function createInventoryAdjustmentAction(data: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
}) {
  try {
    const s = await requireAdminOrManager();
    return await createInventoryAdjustment({ ...data, dibuat_oleh: s.uid });
  } catch (error) {
    console.error("Error in createInventoryAdjustmentAction:", error);
    throw error;
  }
}

export async function createWasteMovementAction(data: {
  barang_id: string;
  qty: number;
  reason: string;
  tanggal?: string;
  dibuat_oleh?: string | null;
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
}) {
  try {
    const s = await requireAdminOrManager();
    return await createWasteMovement({ ...data, dibuat_oleh: s.uid });
  } catch (error) {
    console.error("Error in createWasteMovementAction:", error);
    throw error;
  }
}

export async function getRollVariantsAction(barangId?: string) {
  try {
    return await getRollVariants(barangId);
  } catch (error) {
    console.error("Error in getRollVariantsAction:", error);
    throw error;
  }
}

export async function convertRollVariantAction(data: {
  source_roll_variant_id: string;
  target_widths_m: number[];
  length_m?: number | null;
  reason?: string | null;
}) {
  try {
    const s = await requireAdminOrManager();
    return await convertRollVariant({ ...data, dibuat_oleh: s.uid });
  } catch (error) {
    console.error("Error in convertRollVariantAction:", error);
    throw error;
  }
}

/**
 * Get master data for material modal dropdowns
 */
export async function getCategoriesAction() {
  try {
    const { getCategories } = await import("@/lib/services/master-service");
    return await getCategories();
  } catch (error) {
    console.error("Error in getCategoriesAction:", error);
    throw error;
  }
}

export async function getSubcategoriesAction() {
  try {
    const { getSubcategories } = await import("@/lib/services/master-service");
    return await getSubcategories();
  } catch (error) {
    console.error("Error in getSubcategoriesAction:", error);
    throw error;
  }
}

export async function getUnitsAction() {
  try {
    const { getUnits } = await import("@/lib/services/master-service");
    return await getUnits();
  } catch (error) {
    console.error("Error in getUnitsAction:", error);
    throw error;
  }
}

export async function getQuickSpecsAction() {
  try {
    const { getQuickSpecs } = await import("@/lib/services/master-service");
    return await getQuickSpecs();
  } catch (error) {
    console.error("Error in getQuickSpecsAction:", error);
    throw error;
  }
}
