/**
 * Materials Service
 * Universal API untuk Materials yang bekerja di Tauri dan Web
 */

import { db } from "../db-unified";

export interface Material {
  id: string;
  nama: string;
  deskripsi?: string | null;
  kategori_id?: string | null;
  subkategori_id?: string | null;
  satuan_dasar: string;
  spesifikasi?: string | null;
  jumlah_stok: number;
  level_stok_minimum: number;
  lacak_inventori_status: boolean | number;
  butuh_dimensi_status: boolean | number;
  category_name?: string;
  subcategory_name?: string;
  unit_prices?: UnitPrice[];
}

export interface UnitPrice {
  id?: string;
  barang_id?: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_jual: number;
  harga_member: number;
  harga_beli?: number;
  default_status: boolean | number;
  urutan_tampilan?: number;
}

/**
 * Get all materials with their unit prices
 */
export async function getMaterials(): Promise<Material[]> {
  try {
    // Fetch materials
    const materialsResult = await db.query<Material>("barang", {
      orderBy: { column: "nama", ascending: true },
    });

    if (materialsResult.error) {
      throw materialsResult.error;
    }

    const materials = materialsResult.data || [];

    // Fetch categories and subcategories for enrichment
    const categoriesResult = await db.query("kategori_barang");
    const subcategoriesResult = await db.query("subkategori_barang");

    const categories = categoriesResult.data || [];
    const subcategories = subcategoriesResult.data || [];

    // Enrich materials with category names and unit prices
    const materialsWithUnits = await Promise.all(
      materials.map(async (material: Material) => {
        // Find category name
        const category = categories.find(
          (c: any) => c.id === material.kategori_id
        );
        const subcategory = subcategories.find(
          (sc: any) => sc.id === material.subkategori_id
        );

        // Fetch unit prices
        const unitPricesResult = await db.query<UnitPrice>(
          "harga_barang_satuan",
          {
            where: { barang_id: material.id },
            orderBy: { column: "urutan_tampilan", ascending: true },
          }
        );

        return {
          ...material,
          category_name: category?.nama || undefined,
          subcategory_name: subcategory?.nama || undefined,
          unit_prices: unitPricesResult.data || [],
        };
      })
    );

    return materialsWithUnits;
  } catch (error) {
    console.error("Error fetching materials:", error);
    throw error;
  }
}

/**
 * Get single material by ID
 */
export async function getMaterialById(id: string): Promise<Material | null> {
  try {
    const materialResult = await db.queryOne<Material>("barang", {
      where: { id },
    });

    if (materialResult.error || !materialResult.data) {
      return null;
    }

    const material = materialResult.data;

    // Fetch category name
    if (material.kategori_id) {
      const categoryResult = await db.queryOne("kategori_barang", {
        where: { id: material.kategori_id },
      });
      if (categoryResult.data) {
        material.category_name = categoryResult.data.nama;
      }
    }

    // Fetch subcategory name
    if (material.subkategori_id) {
      const subcategoryResult = await db.queryOne("subkategori_barang", {
        where: { id: material.subkategori_id },
      });
      if (subcategoryResult.data) {
        material.subcategory_name = subcategoryResult.data.nama;
      }
    }

    // Fetch unit prices
    const unitPricesResult = await db.query<UnitPrice>("harga_barang_satuan", {
      where: { barang_id: id },
      orderBy: { column: "urutan_tampilan", ascending: true },
    });

    return {
      ...material,
      unit_prices: unitPricesResult.data || [],
    };
  } catch (error) {
    console.error("Error fetching material:", error);
    return null;
  }
}

/**
 * Create new material with unit prices
 */
export async function createMaterial(
  material: Omit<Material, "id" | "category_name" | "subcategory_name">
): Promise<{ id: string } | null> {
  try {
    const materialId = crypto.randomUUID();

    // Separate unit_prices from material data
    const { unit_prices, ...materialData } = material as any;

    // Insert material
    const materialResult = await db.insert("barang", {
      id: materialId,
      ...materialData,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    });

    if (materialResult.error) {
      throw materialResult.error;
    }

    // Insert unit prices
    if (unit_prices && unit_prices.length > 0) {
      for (const unitPrice of unit_prices) {
        await db.insert("harga_barang_satuan", {
          id: crypto.randomUUID(),
          barang_id: materialId,
          ...unitPrice,
        });
      }
    }

    return { id: materialId };
  } catch (error) {
    console.error("Error creating material:", error);
    throw error;
  }
}

/**
 * Update material and its unit prices
 */
export async function updateMaterial(
  id: string,
  material: Partial<Material>
): Promise<boolean> {
  try {
    // Separate unit_prices from material data
    const { unit_prices, category_name, subcategory_name, ...materialData } =
      material as any;

    // Update material
    const materialResult = await db.update("barang", id, {
      ...materialData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (materialResult.error) {
      throw materialResult.error;
    }

    // Update unit prices if provided
    if (unit_prices && unit_prices.length > 0) {
      // Delete existing unit prices
      // Note: In production, you'd want to be more careful about this
      // Perhaps keep existing prices and only update/add new ones
      for (const unitPrice of unit_prices) {
        if (unitPrice.id && unitPrice.id.startsWith("hbs-")) {
          // Update existing
          await db.update("harga_barang_satuan", unitPrice.id, unitPrice);
        } else {
          // Insert new
          await db.insert("harga_barang_satuan", {
            id: crypto.randomUUID(),
            barang_id: id,
            ...unitPrice,
          });
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error updating material:", error);
    throw error;
  }
}

/**
 * Delete material (and cascade delete unit prices)
 */
export async function deleteMaterial(id: string): Promise<boolean> {
  try {
    // Delete unit prices first (foreign key constraint)
    const unitPricesResult = await db.query("harga_barang_satuan", {
      where: { barang_id: id },
    });

    if (unitPricesResult.data) {
      for (const unitPrice of unitPricesResult.data) {
        await db.delete("harga_barang_satuan", unitPrice.id);
      }
    }

    // Delete material
    const result = await db.delete("barang", id);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error deleting material:", error);
    throw error;
  }
}

/**
 * Get material categories
 */
export async function getMaterialCategories() {
  const result = await db.query("kategori_barang", {
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  return result.data || [];
}

/**
 * Get material subcategories
 */
export async function getMaterialSubcategories(kategori_id?: string) {
  const result = await db.query("subkategori_barang", {
    where: kategori_id ? { kategori_id } : undefined,
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  return result.data || [];
}

/**
 * Get units
 */
export async function getUnits() {
  const result = await db.query("satuan", {
    orderBy: { column: "nama", ascending: true },
  });
  return result.data || [];
}
