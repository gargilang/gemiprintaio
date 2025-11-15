"use server";

/**
 * Server Actions for Materials Page
 */

import {
  getMaterials,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  type Material,
} from "@/lib/services/materials-service";

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
  data: any
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
