/**
 * Purchases Service
 * Universal API untuk Purchases yang bekerja di Tauri dan Web
 */

import { db } from "../db-unified";

export interface Purchase {
  id: string;
  nomor_pembelian: string;
  nomor_faktur: string;
  vendor_id: string;
  vendor_name?: string;
  tanggal: string;
  metode_pembayaran: string;
  total_harga: number;
  status_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  pembelian_id: string;
  barang_id: string;
  nama_barang?: string;
  harga_satuan_id: string;
  nama_satuan: string;
  faktor_konversi: number;
  jumlah: number;
  harga_satuan: number;
  subtotal: number;
}

export interface InitData {
  purchases: Purchase[];
  materials: any[];
  vendors: any[];
  categories: any[];
  subcategories: any[];
  units: any[];
}

/**
 * Get all purchases with items
 */
export async function getPurchases(): Promise<Purchase[]> {
  try {
    // Get all purchases with vendor info
    const purchasesResult = await db.query<Purchase>("pembelian", {
      orderBy: { column: "created_at", ascending: false },
    });

    if (purchasesResult.error) {
      throw purchasesResult.error;
    }

    const purchases = purchasesResult.data || [];

    // Get vendors for enrichment
    const vendorsResult = await db.query("vendor");
    const vendors = vendorsResult.data || [];

    // Get items for each purchase
    const purchasesWithItems = await Promise.all(
      purchases.map(async (purchase) => {
        // Get items
        const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
          where: { pembelian_id: purchase.id },
        });

        const items = itemsResult.data || [];

        // Get material names
        const itemsWithNames = await Promise.all(
          items.map(async (item) => {
            const materialResult = await db.query("barang", {
              where: { id: item.barang_id },
            });
            const material = materialResult.data?.[0];

            return {
              ...item,
              nama_barang: material?.nama || "",
            };
          })
        );

        // Find vendor name
        const vendor = vendors.find((v: any) => v.id === purchase.vendor_id);

        // Calculate total
        const total_harga = itemsWithNames.reduce(
          (sum, item) =>
            sum + (item.subtotal || item.jumlah * item.harga_satuan),
          0
        );

        return {
          ...purchase,
          vendor_name: vendor?.nama_perusahaan || "",
          items: itemsWithNames,
          total_harga,
        };
      })
    );

    return purchasesWithItems;
  } catch (error) {
    console.error("Error fetching purchases:", error);
    throw error;
  }
}

/**
 * Get init data for purchases page (aggregate)
 */
export async function getInitData(): Promise<InitData> {
  try {
    // Parallel queries for speed
    const [
      purchasesResult,
      materialsResult,
      vendorsResult,
      categoriesResult,
      subcategoriesResult,
      unitsResult,
    ] = await Promise.all([
      getPurchases(),
      import("./materials-service").then((m) => m.getMaterials()),
      import("./vendors-service").then((v) => v.getVendors()),
      db.query("kategori_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
      db.query("subkategori_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
      db.query("satuan_barang", {
        orderBy: { column: "urutan_tampilan", ascending: true },
      }),
    ]);

    return {
      purchases: purchasesResult,
      materials: materialsResult,
      vendors: vendorsResult,
      categories: categoriesResult.data || [],
      subcategories: subcategoriesResult.data || [],
      units: unitsResult.data || [],
    };
  } catch (error) {
    console.error("Error fetching init data:", error);
    throw error;
  }
}

/**
 * Create new purchase with items
 */
export async function createPurchase(data: {
  nomor_pembelian: string;
  nomor_faktur: string;
  vendor_id: string;
  tanggal: string;
  metode_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  items: Array<{
    barang_id: string;
    harga_satuan_id: string;
    nama_satuan: string;
    faktor_konversi: number;
    jumlah: number;
    harga_satuan: number;
  }>;
}): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    // Generate ID
    const purchaseId = `purchase-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // Calculate total
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    // Create purchase
    const purchase = {
      id: purchaseId,
      nomor_pembelian: data.nomor_pembelian,
      nomor_faktur: data.nomor_faktur.trim(),
      vendor_id: data.vendor_id,
      tanggal: data.tanggal,
      metode_pembayaran: data.metode_pembayaran,
      total_harga,
      status_pembayaran:
        data.metode_pembayaran === "tunai" ? "lunas" : "belum_lunas",
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: data.dibuat_oleh || null,
    };

    const purchaseResult = await db.insert("pembelian", purchase);
    if (purchaseResult.error) {
      throw purchaseResult.error;
    }

    // Create items
    for (const item of data.items) {
      const itemId = `pi-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const subtotal = item.jumlah * item.harga_satuan;

      const purchaseItem = {
        id: itemId,
        pembelian_id: purchaseId,
        barang_id: item.barang_id,
        harga_satuan_id: item.harga_satuan_id,
        nama_satuan: item.nama_satuan,
        faktor_konversi: item.faktor_konversi,
        jumlah: item.jumlah,
        harga_satuan: item.harga_satuan,
        subtotal,
      };

      const itemResult = await db.insert("item_pembelian", purchaseItem);
      if (itemResult.error) {
        console.error("Failed to insert purchase item:", itemResult.error);
        // TODO: Implement rollback with transaction
      }

      // Update material stock if tracking inventory
      const materialResult = await db.query("barang", {
        where: { id: item.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const jumlahDalamSatuanDasar = item.jumlah * item.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) + jumlahDalamSatuanDasar;

        await db.update("barang", item.barang_id, {
          jumlah_stok: newStock,
        });
      }
    }

    return { id: purchaseId };
  } catch (error: any) {
    console.error("Error creating purchase:", error);
    throw error;
  }
}

/**
 * Get single purchase by ID
 */
export async function getPurchaseById(id: string): Promise<Purchase | null> {
  try {
    const purchaseResult = await db.queryOne<Purchase>("pembelian", {
      where: { id },
    });

    if (purchaseResult.error || !purchaseResult.data) {
      return null;
    }

    const purchase = purchaseResult.data;

    // Get items
    const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });

    const items = itemsResult.data || [];

    // Get material names
    const itemsWithNames = await Promise.all(
      items.map(async (item) => {
        const materialResult = await db.query("barang", {
          where: { id: item.barang_id },
        });
        const material = materialResult.data?.[0];

        return {
          ...item,
          nama_barang: material?.nama || "",
        };
      })
    );

    // Get vendor name
    const vendorResult = await db.query("vendor", {
      where: { id: purchase.vendor_id },
    });
    const vendor = vendorResult.data?.[0];

    // Calculate total
    const total_harga = itemsWithNames.reduce(
      (sum, item) => sum + (item.subtotal || item.jumlah * item.harga_satuan),
      0
    );

    return {
      ...purchase,
      vendor_name: vendor?.nama_perusahaan || "",
      items: itemsWithNames,
      total_harga,
    };
  } catch (error) {
    console.error("Error fetching purchase:", error);
    throw error;
  }
}
