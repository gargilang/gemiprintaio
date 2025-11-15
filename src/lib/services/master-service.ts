/**
 * Master Data Service
 * Handles all master data tables (categories, units, finishing options, etc.)
 */

import "server-only";

import { db } from "../db-unified";

// ============================================================================
// TYPES / INTERFACES
// ============================================================================

export interface Category {
  id: string;
  nama: string;
  butuh_spesifikasi_status: number;
  urutan_tampilan: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface Subcategory {
  id: string;
  kategori_id: string;
  nama: string;
  urutan_tampilan: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface Unit {
  id: string;
  nama: string;
  urutan_tampilan?: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface QuickSpec {
  id: string;
  kategori_id: string;
  nama: string;
  urutan_tampilan: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface FinishingOption {
  id: string;
  nama: string;
  aktif_status: number;
  urutan_tampilan: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

export interface PaymentMethod {
  id: string;
  nama: string;
  aktif_status: number;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

// ============================================================================
// CATEGORIES
// ============================================================================

export async function getCategories(): Promise<Category[]> {
  try {
    const result = await db.query<Category>("kategori_barang", {
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    throw error;
  }
}

export async function getCategoryById(id: string): Promise<Category | null> {
  try {
    const result = await db.queryOne<Category>("kategori_barang", {
      where: { id },
    });
    return result.data;
  } catch (error) {
    console.error("Error fetching category:", error);
    return null;
  }
}

export async function createCategory(
  category: Omit<Category, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const categoryId = crypto.randomUUID();
    const result = await db.insert("kategori_barang", {
      id: categoryId,
      ...category,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: categoryId };
  } catch (error) {
    console.error("Error creating category:", error);
    throw error;
  }
}

export async function updateCategory(
  id: string,
  category: Partial<Category>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = category as any;
    const result = await db.update("kategori_barang", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating category:", error);
    throw error;
  }
}

export async function deleteCategory(id: string): Promise<boolean> {
  try {
    const result = await db.delete("kategori_barang", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting category:", error);
    throw error;
  }
}

// ============================================================================
// SUBCATEGORIES
// ============================================================================

export async function getSubcategories(
  kategori_id?: string
): Promise<Subcategory[]> {
  try {
    const result = await db.query<Subcategory>("subkategori_barang", {
      where: kategori_id ? { kategori_id } : undefined,
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    throw error;
  }
}

export async function createSubcategory(
  subcategory: Omit<Subcategory, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const subcategoryId = crypto.randomUUID();
    const result = await db.insert("subkategori_barang", {
      id: subcategoryId,
      ...subcategory,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: subcategoryId };
  } catch (error) {
    console.error("Error creating subcategory:", error);
    throw error;
  }
}

export async function updateSubcategory(
  id: string,
  subcategory: Partial<Subcategory>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = subcategory as any;
    const result = await db.update("subkategori_barang", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating subcategory:", error);
    throw error;
  }
}

export async function deleteSubcategory(id: string): Promise<boolean> {
  try {
    const result = await db.delete("subkategori_barang", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    throw error;
  }
}

// ============================================================================
// UNITS
// ============================================================================

export async function getUnits(): Promise<Unit[]> {
  try {
    const result = await db.query<Unit>("satuan_barang", {
      orderBy: { column: "nama", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching units:", error);
    throw error;
  }
}

export async function createUnit(
  unit: Omit<Unit, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const unitId = crypto.randomUUID();
    const result = await db.insert("satuan_barang", {
      id: unitId,
      ...unit,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: unitId };
  } catch (error) {
    console.error("Error creating unit:", error);
    throw error;
  }
}

export async function updateUnit(
  id: string,
  unit: Partial<Unit>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = unit as any;
    const result = await db.update("satuan_barang", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating unit:", error);
    throw error;
  }
}

export async function deleteUnit(id: string): Promise<boolean> {
  try {
    const result = await db.delete("satuan_barang", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting unit:", error);
    throw error;
  }
}

// ============================================================================
// QUICK SPECS
// ============================================================================

export async function getQuickSpecs(
  kategori_id?: string
): Promise<QuickSpec[]> {
  try {
    const result = await db.query<QuickSpec>("spesifikasi_cepat", {
      where: kategori_id ? { kategori_id } : undefined,
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching quick specs:", error);
    throw error;
  }
}

export async function createQuickSpec(
  spec: Omit<QuickSpec, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const specId = crypto.randomUUID();
    const result = await db.insert("spesifikasi_cepat", {
      id: specId,
      ...spec,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: specId };
  } catch (error) {
    console.error("Error creating quick spec:", error);
    throw error;
  }
}

export async function updateQuickSpec(
  id: string,
  spec: Partial<QuickSpec>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = spec as any;
    const result = await db.update("spesifikasi_cepat", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating quick spec:", error);
    throw error;
  }
}

export async function deleteQuickSpec(id: string): Promise<boolean> {
  try {
    const result = await db.delete("spesifikasi_cepat", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting quick spec:", error);
    throw error;
  }
}

// ============================================================================
// FINISHING OPTIONS
// ============================================================================

export async function getFinishingOptions(): Promise<FinishingOption[]> {
  try {
    const result = await db.query<FinishingOption>("opsi_finishing", {
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching finishing options:", error);
    throw error;
  }
}

export async function createFinishingOption(
  option: Omit<FinishingOption, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const optionId = crypto.randomUUID();
    const result = await db.insert("opsi_finishing", {
      id: optionId,
      ...option,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: optionId };
  } catch (error) {
    console.error("Error creating finishing option:", error);
    throw error;
  }
}

export async function updateFinishingOption(
  id: string,
  option: Partial<FinishingOption>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = option as any;
    const result = await db.update("opsi_finishing", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating finishing option:", error);
    throw error;
  }
}

export async function deleteFinishingOption(id: string): Promise<boolean> {
  try {
    const result = await db.delete("opsi_finishing", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting finishing option:", error);
    throw error;
  }
}

// ============================================================================
// PAYMENT METHODS
// ============================================================================

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  try {
    const result = await db.query<PaymentMethod>("metode_pembayaran", {
      orderBy: { column: "nama", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    throw error;
  }
}

export async function createPaymentMethod(
  method: Omit<PaymentMethod, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const methodId = crypto.randomUUID();
    const result = await db.insert("metode_pembayaran", {
      id: methodId,
      ...method,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return { id: methodId };
  } catch (error) {
    console.error("Error creating payment method:", error);
    throw error;
  }
}

export async function updatePaymentMethod(
  id: string,
  method: Partial<PaymentMethod>
): Promise<boolean> {
  try {
    const { dibuat_pada, ...updateData } = method as any;
    const result = await db.update("metode_pembayaran", id, {
      ...updateData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error updating payment method:", error);
    throw error;
  }
}

export async function deletePaymentMethod(id: string): Promise<boolean> {
  try {
    const result = await db.delete("metode_pembayaran", id);
    if (result.error) throw result.error;
    return true;
  } catch (error) {
    console.error("Error deleting payment method:", error);
    throw error;
  }
}

// ============================================================================
// REORDER FUNCTIONS
// ============================================================================

/**
 * Reorder categories
 */
export async function reorderCategories(
  items: Array<{ id: string; urutan_tampilan: number }>
): Promise<void> {
  try {
    for (const item of items) {
      await db.update("kategori_barang", item.id, {
        urutan_tampilan: item.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering categories:", error);
    throw error;
  }
}

/**
 * Reorder subcategories
 */
export async function reorderSubcategories(
  items: Array<{ id: string; urutan_tampilan: number }>
): Promise<void> {
  try {
    for (const item of items) {
      await db.update("subkategori_barang", item.id, {
        urutan_tampilan: item.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering subcategories:", error);
    throw error;
  }
}

/**
 * Reorder units
 */
export async function reorderUnits(
  items: Array<{ id: string; urutan_tampilan: number }>
): Promise<void> {
  try {
    for (const item of items) {
      await db.update("satuan_barang", item.id, {
        urutan_tampilan: item.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering units:", error);
    throw error;
  }
}

/**
 * Reorder quick specs
 */
export async function reorderQuickSpecs(
  items: Array<{ id: string; urutan_tampilan: number }>
): Promise<void> {
  try {
    for (const item of items) {
      await db.update("spesifikasi_cepat", item.id, {
        urutan_tampilan: item.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering quick specs:", error);
    throw error;
  }
}
