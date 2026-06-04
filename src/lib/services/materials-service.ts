/**
 * Layanan Barang (Materials)
 * API universal untuk Barang di Tauri dan Web.
 *
 * Catatan migrasi:
 * - Nama identifier primer akan bertahap pindah ke Bahasa Indonesia (`Barang`,
 *   `getBarang`, dll). Untuk sekarang internal masih memakai `Material` untuk
 *   minimalisir risiko regresi; alias Indonesia di-export di bawah.
 */

import "server-only";

import { db, getServerSupabaseClient } from "../db-unified";
import { getReferencedHargaSatuanIds } from "../server-data-supabase";

function toDbIntBoolean(value: unknown): 0 | 1 {
  return value === true || value === 1 ? 1 : 0;
}

function compactObject<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export interface Material {
  id: string;
  nama: string;
  deskripsi?: string | null;
  kategori_id?: string | null;
  subkategori_id?: string | null;
  satuan_dasar: string;
  spesifikasi?: string | null;
  jumlah_stok: number;
  average_cost_per_base_unit?: number;
  level_stok_minimum: number;
  lacak_inventori_status: boolean | number;
  butuh_dimensi_status: boolean | number;
  roll_inventory_status?: boolean | number;
  category_name?: string;
  subcategory_name?: string;
  unit_prices?: UnitPrice[];
  roll_variants?: Array<{
    id: string;
    lebar_m: number;
    panjang_tersedia_m: number;
    average_cost_per_m2: number;
    aktif_status: number;
  }>;
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

    // Batch-load semua unit prices dan roll variants sekaligus (hindari N+1 query)
    const allUnitPricesResult = await db.query<UnitPrice>("harga_barang_satuan", {
      orderBy: { column: "urutan_tampilan", ascending: true },
    });
    const allRollVariantsResult = await db.query<any>("barang_roll_variants", {
      orderBy: { column: "lebar_m", ascending: true },
    });

    const allUnitPrices = allUnitPricesResult.data || [];
    const allRollVariants = allRollVariantsResult.data || [];

    // Group di memory berdasarkan barang_id
    const unitPricesByBarangId = new Map<string, UnitPrice[]>();
    for (const up of allUnitPrices) {
      const list = unitPricesByBarangId.get(up.barang_id!) || [];
      list.push(up);
      unitPricesByBarangId.set(up.barang_id!, list);
    }

    const rollVariantsByBarangId = new Map<string, any[]>();
    for (const rv of allRollVariants) {
      if (Number(rv.aktif_status) === 0) continue;
      const list = rollVariantsByBarangId.get(rv.barang_id) || [];
      list.push(rv);
      rollVariantsByBarangId.set(rv.barang_id, list);
    }

    // Enrich materials dengan category names dan unit prices
    const materialsWithUnits = materials.map((material: Material) => {
      const category = categories.find((c: any) => c.id === material.kategori_id);
      const subcategory = subcategories.find((sc: any) => sc.id === material.subkategori_id);
      return {
        ...material,
        category_name: category?.nama || undefined,
        subcategory_name: subcategory?.nama || undefined,
        unit_prices: unitPricesByBarangId.get(material.id) || [],
        roll_variants: rollVariantsByBarangId.get(material.id) || [],
      };
    });

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
    const rollVariantsResult = await db.query<any>("barang_roll_variants", {
      where: { barang_id: id },
      orderBy: { column: "lebar_m", ascending: true },
    });

    return {
      ...material,
      unit_prices: unitPricesResult.data || [],
      roll_variants: (rollVariantsResult.data || []).filter(
        (row: any) => Number(row.aktif_status) !== 0
      ),
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
    const isDimensional = toDbIntBoolean(materialData.butuh_dimensi_status) === 1;
    const defaultUnitPrice =
      Array.isArray(unit_prices) && unit_prices.length > 0
        ? unit_prices.find((up: UnitPrice) => toDbIntBoolean(up.default_status) === 1) ??
          unit_prices.find((up: UnitPrice) => Number(up.faktor_konversi) === 1) ??
          unit_prices[0]
        : null;
    const initialAverageCostPerBaseUnit =
      defaultUnitPrice && Number(defaultUnitPrice.faktor_konversi || 0) > 0
        ? Number(defaultUnitPrice.harga_beli || 0) /
          Number(defaultUnitPrice.faktor_konversi || 1)
        : 0;
    const materialResult = await db.insert("barang", {
      id: materialId,
      ...materialData,
      // Force m² unit and zero stock for dimensional materials so the
      // inventory accounting stays in square meters.
      satuan_dasar: isDimensional ? "m²" : materialData.satuan_dasar,
      jumlah_stok: isDimensional ? 0 : materialData.jumlah_stok ?? 0,
      level_stok_minimum: isDimensional
        ? 0
        : materialData.level_stok_minimum ?? 0,
      lacak_inventori_status: toDbIntBoolean(materialData.lacak_inventori_status),
      butuh_dimensi_status: toDbIntBoolean(materialData.butuh_dimensi_status),
      roll_inventory_status: isDimensional
        ? 1
        : toDbIntBoolean(materialData.roll_inventory_status),
      average_cost_per_base_unit:
        materialData.average_cost_per_base_unit ?? initialAverageCostPerBaseUnit,
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
          ...compactObject(unitPrice),
          default_status: toDbIntBoolean(unitPrice.default_status),
        });
      }
    }

    return { id: materialId };
  } catch (error) {
    console.error("Error creating material:", error);
    throw error;
  }
}

async function deleteOrphanUnitPricesSafe(
  barangId: string,
  keepIds: string[]
): Promise<void> {
  const existingResult = await db.query<{ id: string }>(
    "harga_barang_satuan",
    {
      where: { barang_id: barangId },
    }
  );

  const existingIds = (existingResult.data || []).map((r) => r.id);
  const idsToDelete = existingIds.filter((uid) => !keepIds.includes(uid));
  if (idsToDelete.length === 0) return;

  let refSet: Set<string>;
  if (getServerSupabaseClient()) {
    refSet = await getReferencedHargaSatuanIds(idsToDelete);
  } else {
    const placeholders = idsToDelete.map(() => "?").join(",");
    const referenced = await db.queryRaw<{ harga_satuan_id: string }>(
      `SELECT DISTINCT harga_satuan_id FROM (
      SELECT harga_satuan_id FROM item_pembelian WHERE harga_satuan_id IN (${placeholders})
      UNION
      SELECT harga_satuan_id FROM item_penjualan WHERE harga_satuan_id IN (${placeholders})
    )`,
      [...idsToDelete, ...idsToDelete]
    );
    refSet = new Set(
      (referenced || []).map((r) => r.harga_satuan_id).filter(Boolean)
    );
  }
  const safeToDelete = idsToDelete.filter((uid) => !refSet.has(uid));

  for (const uid of safeToDelete) {
    await db.delete("harga_barang_satuan", uid);
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

    if (unit_prices !== undefined && Array.isArray(unit_prices)) {
      const keepIds = unit_prices
        .map((up: UnitPrice) => up.id)
        .filter((x): x is string => Boolean(x));
      await deleteOrphanUnitPricesSafe(id, keepIds);
    }

    // Detect transition: butuh_dimensi was off, now turning on. Stock units
    // change from linear to m² so the existing numeric stock no longer
    // applies. Reset both jumlah_stok and level_stok_minimum to 0 unless the
    // caller already supplied 0 explicitly.
    if (materialData.butuh_dimensi_status !== undefined) {
      const turningOn = toDbIntBoolean(materialData.butuh_dimensi_status) === 1;
      if (turningOn) {
        const before = await db.queryOne<Material>("barang", {
          where: { id },
        });
        const wasOff =
          !before.data ||
          Number((before.data as any).butuh_dimensi_status) !== 1;
        if (wasOff) {
          // Force the canonical unit and zero-out stock to keep accounting
          // consistent.
          materialData.satuan_dasar = "m²";
          materialData.jumlah_stok = 0;
          materialData.level_stok_minimum = 0;
        }
      }
    }

    // Update material
    const normalizedMaterialData = {
      ...materialData,
      ...(materialData.lacak_inventori_status !== undefined
        ? {
            lacak_inventori_status:
              toDbIntBoolean(materialData.lacak_inventori_status),
          }
        : {}),
      ...(materialData.butuh_dimensi_status !== undefined
        ? {
            butuh_dimensi_status:
              toDbIntBoolean(materialData.butuh_dimensi_status),
            roll_inventory_status:
              toDbIntBoolean(materialData.butuh_dimensi_status),
          }
        : {}),
    };

    const materialResult = await db.update("barang", id, {
      ...normalizedMaterialData,
      diperbarui_pada: new Date().toISOString(),
    });

    if (materialResult.error) {
      throw materialResult.error;
    }

    // Update unit prices if provided
    if (unit_prices && unit_prices.length > 0) {
      for (const unitPrice of unit_prices) {
        const unitPricePayload = compactObject({
          nama_satuan: unitPrice.nama_satuan,
          faktor_konversi: unitPrice.faktor_konversi,
          harga_beli: unitPrice.harga_beli ?? 0,
          harga_jual: unitPrice.harga_jual ?? 0,
          harga_member: unitPrice.harga_member ?? 0,
          default_status: toDbIntBoolean(unitPrice.default_status),
          urutan_tampilan: unitPrice.urutan_tampilan,
          diperbarui_pada: new Date().toISOString(),
        });

        if (unitPrice.id) {
          // Update existing
          await db.update("harga_barang_satuan", unitPrice.id, unitPricePayload);
        } else {
          // Insert new
          await db.insert("harga_barang_satuan", {
            id: crypto.randomUUID(),
            barang_id: id,
            ...unitPricePayload,
            dibuat_pada: new Date().toISOString(),
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
    // Cek apakah barang sudah dipakai di pembelian atau penjualan.
    // Kalau iya, tolak dengan pesan yang menyebut nomor transaksi spesifik.
    const [purchaseItemsRes, saleItemsRes] = await Promise.all([
      db.query<any>("item_pembelian", { where: { barang_id: id } }),
      db.query<any>("item_penjualan", { where: { barang_id: id } }),
    ]);

    const purchaseItems = purchaseItemsRes.data || [];
    const saleItems = (saleItemsRes.data || []).filter(
      (it: any) => it.barang_id === id && it.tipe_item !== "MAKLON"
    );

    const blockingMessages: string[] = [];

    if (purchaseItems.length > 0) {
      // Resolve nomor pembelian
      const purchaseIds = [...new Set(purchaseItems.map((it: any) => it.pembelian_id as string))];
      const purchaseLabels: string[] = [];
      for (const pid of purchaseIds) {
        const p = await db.queryOne<any>("pembelian", { where: { id: pid } });
        if (p.data) {
          const label = p.data.nomor_faktur || p.data.nomor_pembelian || pid;
          const tgl = p.data.tanggal
            ? new Date(p.data.tanggal).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "";
          purchaseLabels.push(tgl ? `${label} (${tgl})` : label);
        }
      }
      if (purchaseLabels.length > 0) {
        blockingMessages.push(
          `dipakai di pembelian: ${purchaseLabels.join(", ")}`
        );
      }
    }

    if (saleItems.length > 0) {
      const saleIds = [...new Set(saleItems.map((it: any) => it.penjualan_id as string))];
      const saleLabels: string[] = [];
      for (const sid of saleIds) {
        const s = await db.queryOne<any>("penjualan", { where: { id: sid } });
        if (s.data) {
          const label = s.data.nomor_faktur || sid;
          const tgl = s.data.dibuat_pada
            ? new Date(s.data.dibuat_pada).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "";
          saleLabels.push(tgl ? `${label} (${tgl})` : label);
        }
      }
      if (saleLabels.length > 0) {
        blockingMessages.push(
          `dipakai di penjualan: ${saleLabels.join(", ")}`
        );
      }
    }

    if (blockingMessages.length > 0) {
      throw new Error(
        `Barang tidak bisa dihapus karena sudah ${blockingMessages.join("; ")}. ` +
          `Batalkan atau hapus transaksi tersebut dulu sebelum menghapus barang ini.`
      );
    }

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
  const result = await db.query("satuan_barang", {
    orderBy: { column: "nama", ascending: true },
  });
  return result.data || [];
}

// ──────────────────────────────────────────────────────────────────────────
// Alias Bahasa Indonesia (untuk consumer baru). Internal tetap pakai
// `Material` karena rename luas membutuhkan migrasi banyak file consumer
// dan risikonya tidak sebanding dengan keuntungan konsistensinya.
// ──────────────────────────────────────────────────────────────────────────

/** Alias Bahasa Indonesia untuk `Material`. */
export type Barang = Material;
/** Alias Bahasa Indonesia untuk `UnitPrice`. */
export type HargaSatuan = UnitPrice;

/** Ambil semua barang beserta harga satuannya. Lihat `getMaterials`. */
export const getBarang = getMaterials;
/** Ambil satu barang berdasarkan ID. Lihat `getMaterialById`. */
export const getBarangById = getMaterialById;
/** Buat barang baru. Lihat `createMaterial`. */
export const createBarang = createMaterial;
/** Perbarui barang. Lihat `updateMaterial`. */
export const updateBarang = updateMaterial;
/** Hapus barang. Lihat `deleteMaterial`. */
export const deleteBarang = deleteMaterial;
/** Ambil daftar kategori barang. Lihat `getMaterialCategories`. */
export const getKategoriBarang = getMaterialCategories;
/** Ambil daftar subkategori barang. Lihat `getMaterialSubcategories`. */
export const getSubkategoriBarang = getMaterialSubcategories;
/** Ambil daftar satuan. Lihat `getUnits`. */
export const getSatuan = getUnits;

