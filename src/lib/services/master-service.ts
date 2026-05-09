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
  tipe_spesifikasi: string;
  nilai_spesifikasi: string;
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
    const data = result.data || [];
    return [...data].sort((a, b) => {
      const u = a.urutan_tampilan - b.urutan_tampilan;
      if (u !== 0) return u;
      return (a.nama || "").localeCompare(b.nama || "");
    });
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
    const data = result.data || [];
    return [...data].sort((a, b) => {
      const u = a.urutan_tampilan - b.urutan_tampilan;
      if (u !== 0) return u;
      return (a.nama || "").localeCompare(b.nama || "");
    });
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    throw error;
  }
}

export type SubcategoryWithCategory = Subcategory & { category_name?: string };

export async function getSubcategoryById(
  id: string
): Promise<Subcategory | null> {
  try {
    const result = await db.queryOne<Subcategory>("subkategori_barang", {
      where: { id },
    });
    return result.data ?? null;
  } catch (error) {
    console.error("Error fetching subcategory:", error);
    return null;
  }
}

export async function getSubcategoryRowById(
  id: string
): Promise<SubcategoryWithCategory | null> {
  const sub = await getSubcategoryById(id);
  if (!sub) return null;
  const cat = await getCategoryById(sub.kategori_id);
  return { ...sub, category_name: cat?.nama };
}

/** Subcategory rows with category_name (same ordering as legacy SQL routes). */
export async function listSubcategoriesWithCategory(
  categoryId?: string | null
): Promise<SubcategoryWithCategory[]> {
  const subs = await getSubcategories(categoryId || undefined);
  if (categoryId) {
    const cat = await getCategoryById(categoryId);
    return subs.map((s) => ({ ...s, category_name: cat?.nama }));
  }
  const categories = await getCategories();
  const catOrder = new Map(categories.map((c) => [c.id, c.urutan_tampilan]));
  const map = new Map(categories.map((c) => [c.id, c.nama]));
  const enriched = subs.map((s) => ({
    ...s,
    category_name: map.get(s.kategori_id),
  }));
  return enriched.sort((a, b) => {
    const ca = catOrder.get(a.kategori_id) ?? 0;
    const cb = catOrder.get(b.kategori_id) ?? 0;
    if (ca !== cb) return ca - cb;
    const u = a.urutan_tampilan - b.urutan_tampilan;
    if (u !== 0) return u;
    return (a.nama || "").localeCompare(b.nama || "");
  });
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
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    const data = result.data || [];
    return [...data].sort((a, b) => {
      const u = (a.urutan_tampilan ?? 0) - (b.urutan_tampilan ?? 0);
      if (u !== 0) return u;
      return (a.nama || "").localeCompare(b.nama || "");
    });
  } catch (error) {
    console.error("Error fetching units:", error);
    throw error;
  }
}

export async function getUnitById(id: string): Promise<Unit | null> {
  try {
    const result = await db.queryOne<Unit>("satuan_barang", {
      where: { id },
    });
    return result.data ?? null;
  } catch (error) {
    console.error("Error fetching unit:", error);
    return null;
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
    const result = await db.query<QuickSpec>("spesifikasi_cepat_barang", {
      where: kategori_id ? { kategori_id } : undefined,
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    return result.data || [];
  } catch (error) {
    console.error("Error fetching quick specs:", error);
    throw error;
  }
}

export type QuickSpecWithCategory = QuickSpec & { category_name?: string };

export async function getQuickSpecById(id: string): Promise<QuickSpec | null> {
  try {
    const result = await db.queryOne<QuickSpec>("spesifikasi_cepat_barang", {
      where: { id },
    });
    return result.data ?? null;
  } catch (error) {
    console.error("Error fetching quick spec:", error);
    return null;
  }
}

export async function getQuickSpecRowById(
  id: string
): Promise<QuickSpecWithCategory | null> {
  const spec = await getQuickSpecById(id);
  if (!spec) return null;
  const cat = await getCategoryById(spec.kategori_id);
  return { ...spec, category_name: cat?.nama };
}

/** Quick specs with category_name and legacy sort order. */
export async function listQuickSpecsWithCategory(
  categoryId?: string | null
): Promise<QuickSpecWithCategory[]> {
  const specs = await getQuickSpecs(categoryId || undefined);
  const categories = await getCategories();
  const catOrder = new Map(
    categories.map((c) => [c.id, c.urutan_tampilan])
  );
  const catName = new Map(categories.map((c) => [c.id, c.nama]));
  const enriched: QuickSpecWithCategory[] = specs.map((q) => ({
    ...q,
    category_name: catName.get(q.kategori_id),
  }));

  if (categoryId) {
    return enriched.sort((a, b) => {
      const t = a.tipe_spesifikasi.localeCompare(b.tipe_spesifikasi);
      if (t !== 0) return t;
      const u = a.urutan_tampilan - b.urutan_tampilan;
      if (u !== 0) return u;
      return a.nilai_spesifikasi.localeCompare(b.nilai_spesifikasi);
    });
  }

  return enriched.sort((a, b) => {
    const ca = catOrder.get(a.kategori_id) ?? 0;
    const cb = catOrder.get(b.kategori_id) ?? 0;
    if (ca !== cb) return ca - cb;
    const t = a.tipe_spesifikasi.localeCompare(b.tipe_spesifikasi);
    if (t !== 0) return t;
    const u = a.urutan_tampilan - b.urutan_tampilan;
    if (u !== 0) return u;
    return a.nilai_spesifikasi.localeCompare(b.nilai_spesifikasi);
  });
}

export async function countMaterialsByCategoryId(
  kategori_id: string
): Promise<number> {
  const rows = await db.queryRaw<{ count: number }>(
    "SELECT COUNT(*) as count FROM barang WHERE kategori_id = ?",
    [kategori_id]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countMaterialsBySubcategoryId(
  subkategori_id: string
): Promise<number> {
  const rows = await db.queryRaw<{ count: number }>(
    "SELECT COUNT(*) as count FROM barang WHERE subkategori_id = ?",
    [subkategori_id]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function createQuickSpec(
  spec: Omit<QuickSpec, "id" | "dibuat_pada" | "diperbarui_pada">
): Promise<{ id: string } | null> {
  try {
    const specId = crypto.randomUUID();
    const result = await db.insert("spesifikasi_cepat_barang", {
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
    const result = await db.update("spesifikasi_cepat_barang", id, {
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
    const result = await db.delete("spesifikasi_cepat_barang", id);
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
      await db.update("spesifikasi_cepat_barang", item.id, {
        urutan_tampilan: item.urutan_tampilan,
        diperbarui_pada: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error reordering quick specs:", error);
    throw error;
  }
}
