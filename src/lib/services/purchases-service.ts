/**
 * Purchases Service
 * Universal API untuk Purchases yang bekerja di Tauri dan Web
 */

import "server-only";

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
  jumlah_dibayar?: number;
  status_pembayaran: string;
  catatan?: string;
  dibuat_oleh?: string;
  created_by_name?: string;
  dibuat_pada?: string;
  diperbarui_pada?: string;
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
      orderBy: { column: "dibuat_pada", ascending: false },
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
  vendor_id: string | null;
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

/**
 * Update an existing purchase
 */
export async function updatePurchase(
  id: string,
  data: {
    nomor_pembelian: string;
    nomor_faktur: string;
    vendor_id: string | null;
    tanggal: string;
    metode_pembayaran: string;
    catatan?: string;
    items: Array<{
      barang_id: string;
      harga_satuan_id: string;
      nama_satuan: string;
      faktor_konversi: number;
      jumlah: number;
      harga_satuan: number;
    }>;
  }
): Promise<{ id: string }> {
  try {
    // Validate
    if (!data.nomor_faktur?.trim()) {
      throw new Error("Nomor faktur harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item pembelian");
    }

    // Check if purchase exists
    const existing = await db.queryOne("pembelian", { where: { id } });
    if (existing.error || !existing.data) {
      throw new Error("Pembelian tidak ditemukan");
    }

    // Calculate new total
    const total_harga = data.items.reduce(
      (sum, item) => sum + item.jumlah * item.harga_satuan,
      0
    );

    // Get old items to reverse stock
    const oldItemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });
    const oldItems = oldItemsResult.data || [];

    // Reverse old stock changes
    for (const oldItem of oldItems) {
      const materialResult = await db.query("barang", {
        where: { id: oldItem.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const stockToRemove = oldItem.jumlah * oldItem.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) - stockToRemove;

        await db.update("barang", oldItem.barang_id, {
          jumlah_stok: newStock,
        });
      }
    }

    // Delete old items
    for (const oldItem of oldItems) {
      await db.delete("item_pembelian", oldItem.id);
    }

    // Update purchase header
    const purchaseUpdate = {
      nomor_pembelian: data.nomor_pembelian,
      nomor_faktur: data.nomor_faktur.trim(),
      vendor_id: data.vendor_id,
      tanggal: data.tanggal,
      total_jumlah: total_harga,
      jumlah_dibayar: data.metode_pembayaran === "tunai" ? total_harga : 0,
      metode_pembayaran: data.metode_pembayaran,
      status_pembayaran:
        data.metode_pembayaran === "tunai" ? "lunas" : "belum_lunas",
      catatan: data.catatan?.trim() || null,
    };

    const updateResult = await db.update("pembelian", id, purchaseUpdate);
    if (updateResult.error) {
      throw updateResult.error;
    }

    // Insert new items
    for (const item of data.items) {
      const itemId = `pi-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const subtotal = item.jumlah * item.harga_satuan;

      const purchaseItem = {
        id: itemId,
        pembelian_id: id,
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
      }

      // Add new stock
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

      // Update harga_beli in harga_barang_satuan if exists
      if (item.harga_satuan_id) {
        await db.update("harga_barang_satuan", item.harga_satuan_id, {
          harga_beli: item.harga_satuan,
        });
      }
    }

    // Update keuangan entry if exists (for LUNAS purchases)
    const keperluanText = `Pembelian ${data.nomor_pembelian} (${
      data.nomor_faktur || data.nomor_pembelian
    }) [REF:${id}]`;

    // Find keuangan entry with reference
    const keuanganResult = await db.queryRaw<any>(
      `SELECT id FROM keuangan WHERE keperluan LIKE ?`,
      [`%[REF:${id}]%`]
    );

    if (keuanganResult && keuanganResult.length > 0) {
      const keuanganId = keuanganResult[0].id;
      await db.update("keuangan", keuanganId, {
        tanggal: data.tanggal,
        keperluan: keperluanText,
        kredit: total_harga,
        biaya_bahan: total_harga,
        catatan: data.catatan || null,
      });
    }

    return { id };
  } catch (error) {
    console.error("Error updating purchase:", error);
    throw error;
  }
}

/**
 * Get all purchases with outstanding debt
 */
export async function getDebts(): Promise<any[]> {
  try {
    const result = await db.queryRaw<any>(`
      SELECT 
        p.id,
        p.nomor_pembelian,
        p.nomor_faktur,
        p.tanggal,
        p.total_jumlah,
        p.jumlah_dibayar,
        p.status_pembayaran,
        (p.total_jumlah - p.jumlah_dibayar) as sisa_hutang,
        v.nama_perusahaan as vendor_name
      FROM pembelian p
      LEFT JOIN vendor v ON p.vendor_id = v.id
      WHERE p.status_pembayaran IN ('HUTANG', 'SEBAGIAN')
      ORDER BY p.tanggal ASC, p.dibuat_pada ASC
    `);

    return result || [];
  } catch (error) {
    console.error("Error fetching debts:", error);
    throw error;
  }
}

/**
 * Delete purchase with stock reversal
 */
export async function deletePurchase(id: string): Promise<void> {
  try {
    // Get items to reverse stock
    const itemsResult = await db.query<PurchaseItem>("item_pembelian", {
      where: { pembelian_id: id },
    });

    const items = itemsResult.data || [];

    // Reverse stock changes
    for (const item of items) {
      const materialResult = await db.query("barang", {
        where: { id: item.barang_id },
      });
      const material = materialResult.data?.[0];

      if (material && material.lacak_inventori_status) {
        const stockToRemove = item.jumlah * item.faktor_konversi;
        const newStock = (material.jumlah_stok || 0) - stockToRemove;

        await db.update("barang", item.barang_id, {
          jumlah_stok: Math.max(0, newStock),
        });
      }
    }

    // Delete keuangan entry by reference (if exists)
    await db.executeRaw("DELETE FROM keuangan WHERE keperluan LIKE ?", [
      `%[REF:${id}]%`,
    ]);

    // Delete purchase items
    await db.executeRaw("DELETE FROM item_pembelian WHERE pembelian_id = ?", [
      id,
    ]);

    // Delete purchase
    const result = await db.delete("pembelian", id);
    if (result.error) throw result.error;

    // TODO: Recalculate cashbook if keuangan was affected
    // This requires importing calculate-cashbook which may not work in unified layer
    console.log("Purchase deleted, cashbook recalculation may be needed");
  } catch (error) {
    console.error("Error deleting purchase:", error);
    throw error;
  }
}

/**
 * Revert payment - change purchase from LUNAS back to HUTANG
 */
export async function revertPayment(purchaseId: string): Promise<void> {
  try {
    // Get purchase
    const purchase = await getPurchaseById(purchaseId);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    // Validate status
    if (purchase.status_pembayaran !== "lunas") {
      throw new Error(
        "Hanya pembelian dengan status LUNAS yang dapat direvert ke HUTANG"
      );
    }

    if (purchase.metode_pembayaran === "tunai") {
      throw new Error(
        "Pembelian dengan metode TUNAI tidak dapat direvert. Hapus saja pembelian jika salah."
      );
    }

    // Get hutang_pembelian record
    const hutangResult = await db.queryRaw<any>(
      "SELECT * FROM hutang_pembelian WHERE id_pembelian = ?",
      [purchaseId]
    );

    const hutangRecord = hutangResult[0];
    if (!hutangRecord) {
      throw new Error("Data hutang tidak ditemukan");
    }

    // Delete pelunasan_hutang records
    await db.executeRaw("DELETE FROM pelunasan_hutang WHERE id_hutang = ?", [
      hutangRecord.id,
    ]);

    // Delete keuangan entries (SUPPLY category)
    await db.executeRaw(
      "DELETE FROM keuangan WHERE kategori_transaksi = 'SUPPLY' AND keperluan LIKE ?",
      [`%${purchase.nomor_faktur}%`]
    );

    // Reset hutang_pembelian
    await db.executeRaw(
      `UPDATE hutang_pembelian 
       SET jumlah_terbayar = 0,
           sisa_hutang = jumlah_hutang,
           status = 'AKTIF'
       WHERE id = ?`,
      [hutangRecord.id]
    );

    // Reset pembelian to HUTANG status
    await db.update("pembelian", purchaseId, {
      jumlah_dibayar: 0,
      status_pembayaran: "belum_lunas",
    });

    // TODO: Recalculate cashbook
    console.log("Payment reverted, cashbook recalculation may be needed");
  } catch (error) {
    console.error("Error reverting payment:", error);
    throw error;
  }
}

/**
 * Pay debt for a purchase
 */
export async function payDebt(data: {
  purchase_id: string;
  jumlah_bayar: number;
  tanggal_bayar?: string;
  metode_pembayaran?: string;
  referensi?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ status: string; sisa_hutang: number }> {
  try {
    // Validate
    if (!data.purchase_id) {
      throw new Error("ID pembelian harus diisi");
    }

    if (!data.jumlah_bayar || data.jumlah_bayar <= 0) {
      throw new Error("Jumlah pembayaran harus lebih dari 0");
    }

    // Get purchase
    const purchase = await getPurchaseById(data.purchase_id);
    if (!purchase) {
      throw new Error("Pembelian tidak ditemukan");
    }

    // Validate payment amount
    const sisaHutang = purchase.total_harga - (purchase.jumlah_dibayar || 0);
    if (data.jumlah_bayar > sisaHutang) {
      throw new Error("Jumlah pembayaran melebihi sisa hutang");
    }

    // Calculate new values
    const newJumlahDibayar = (purchase.jumlah_dibayar || 0) + data.jumlah_bayar;
    const newSisaHutang = purchase.total_harga - newJumlahDibayar;
    const newStatus = newSisaHutang <= 0 ? "lunas" : "sebagian";

    // Get or create hutang_pembelian record
    const hutangResult = await db.queryRaw<any>(
      "SELECT * FROM hutang_pembelian WHERE id_pembelian = ?",
      [data.purchase_id]
    );

    let hutangId = hutangResult[0]?.id;

    if (!hutangId) {
      // Create hutang record
      hutangId = `hutang-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      await db.insert("hutang_pembelian", {
        id: hutangId,
        id_pembelian: data.purchase_id,
        jumlah_hutang: purchase.total_harga,
        jumlah_terbayar: 0,
        sisa_hutang: purchase.total_harga,
        status: "AKTIF",
      });
    }

    // Insert pelunasan_hutang record
    const pelunasanId = `pelunasan-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await db.insert("pelunasan_hutang", {
      id: pelunasanId,
      id_hutang: hutangId,
      tanggal_bayar:
        data.tanggal_bayar || new Date().toISOString().split("T")[0],
      jumlah_bayar: data.jumlah_bayar,
      metode_pembayaran: data.metode_pembayaran || "CASH",
      referensi: data.referensi?.trim() || null,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: data.dibuat_oleh || null,
    });

    // Update hutang_pembelian
    await db.executeRaw(
      `UPDATE hutang_pembelian 
       SET jumlah_terbayar = jumlah_terbayar + ?,
           sisa_hutang = sisa_hutang - ?,
           status = ?
       WHERE id = ?`,
      [
        data.jumlah_bayar,
        data.jumlah_bayar,
        newSisaHutang <= 0 ? "LUNAS" : "AKTIF",
        hutangId,
      ]
    );

    // Update pembelian
    await db.update("pembelian", data.purchase_id, {
      jumlah_dibayar: newJumlahDibayar,
      status_pembayaran: newStatus,
    });

    // Create keuangan entry (SUPPLY category)
    const maxOrderResult = await db.queryRaw<{ max_order: number }>(
      "SELECT MAX(urutan_tampilan) as max_order FROM keuangan",
      []
    );
    const nextOrder = (maxOrderResult[0]?.max_order || 0) + 1;

    // Get vendor info
    const vendorResult = await db.query("vendor", {
      where: { id: purchase.vendor_id },
    });
    const vendor = vendorResult.data?.[0];

    const keperluan = `Pembayaran Hutang ${purchase.nomor_faktur}${
      vendor ? ` - ${vendor.nama_perusahaan}` : ""
    }${data.referensi ? ` (Ref: ${data.referensi})` : ""} [REF:${
      data.purchase_id
    }]`;

    await db.insert("keuangan", {
      id: `keu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tanggal: data.tanggal_bayar || new Date().toISOString().split("T")[0],
      kategori_transaksi: "SUPPLY",
      debit: 0,
      kredit: data.jumlah_bayar,
      keperluan,
      biaya_bahan: data.jumlah_bayar,
      catatan:
        data.catatan ||
        `Pelunasan ${newStatus === "lunas" ? "LUNAS" : "SEBAGIAN"} - ${
          purchase.nomor_faktur
        }`,
      dibuat_oleh: data.dibuat_oleh || null,
      urutan_tampilan: nextOrder,
    });

    // TODO: Recalculate cashbook
    console.log("Debt payment recorded, cashbook recalculation may be needed");

    return {
      status: newStatus,
      sisa_hutang: newSisaHutang,
    };
  } catch (error) {
    console.error("Error paying debt:", error);
    throw error;
  }
}
