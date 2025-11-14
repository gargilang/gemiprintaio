/**
 * Production Service
 * Universal API untuk Production Orders yang bekerja di Tauri dan Web
 */

import { db } from "../db-unified";

export interface ProductionOrder {
  id: string;
  penjualan_id: string;
  nomor_spk: string;
  nomor_invoice?: string;
  pelanggan_nama?: string;
  total_item: number;
  status: "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN";
  prioritas: "NORMAL" | "KILAT";
  tanggal_deadline?: string | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
  diselesaikan_pada?: string | null;
  items?: ProductionItem[];
}

export interface ProductionItem {
  id: string;
  order_produksi_id: string;
  item_penjualan_id: string;
  barang_nama: string;
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  keterangan_dimensi?: string | null;
  mesin_printing?: string | null;
  jenis_bahan?: string | null;
  status: "MENUNGGU" | "PRINTING" | "FINISHING" | "SELESAI";
  catatan_produksi?: string | null;
  operator_id?: string | null;
  operator_nama?: string;
  mulai_proses?: string | null;
  selesai_proses?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
  finishing?: FinishingItem[];
}

export interface FinishingItem {
  id: string;
  item_produksi_id: string;
  jenis_finishing: string;
  keterangan?: string | null;
  status: "MENUNGGU" | "PROSES" | "SELESAI";
  operator_id?: string | null;
  operator_nama?: string;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

/**
 * Get all production orders with items and finishing
 */
export async function getProductionOrders(): Promise<ProductionOrder[]> {
  try {
    // Get all production orders
    const ordersResult = await db.query<ProductionOrder>("order_produksi", {
      orderBy: { column: "dibuat_pada", ascending: false },
    });

    if (ordersResult.error) {
      throw ordersResult.error;
    }

    const orders = ordersResult.data || [];

    // Get penjualan data for enrichment
    const penjualanResult = await db.query("penjualan");
    const penjualanList = penjualanResult.data || [];

    // Get pelanggan data for enrichment
    const pelangganResult = await db.query("pelanggan");
    const pelangganList = pelangganResult.data || [];

    // Get profil data for operator names
    const profilResult = await db.query("profil");
    const profilList = profilResult.data || [];

    // Enrich orders with invoice and customer data, and get items
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        // Find penjualan
        const penjualan = penjualanList.find(
          (p: any) => p.id === order.penjualan_id
        );

        // Find pelanggan
        const pelanggan = pelangganList.find(
          (pel: any) => pel.id === penjualan?.pelanggan_id
        );

        // Get items
        const itemsResult = await db.query<ProductionItem>("item_produksi", {
          where: { order_produksi_id: order.id },
          orderBy: { column: "dibuat_pada", ascending: true },
        });

        const items = itemsResult.data || [];

        // Get finishing for each item
        const itemsWithFinishing = await Promise.all(
          items.map(async (item) => {
            const finishingResult = await db.query<FinishingItem>(
              "item_finishing",
              {
                where: { item_produksi_id: item.id },
                orderBy: { column: "dibuat_pada", ascending: true },
              }
            );

            const finishing = finishingResult.data || [];

            // Enrich finishing with operator names
            const finishingWithOperator = finishing.map((fin) => {
              const operator = profilList.find(
                (prof: any) => prof.id === fin.operator_id
              );
              return {
                ...fin,
                operator_nama: operator?.nama_pengguna || undefined,
              };
            });

            // Enrich item with operator name
            const operator = profilList.find(
              (prof: any) => prof.id === item.operator_id
            );

            return {
              ...item,
              operator_nama: operator?.nama_pengguna || undefined,
              finishing: finishingWithOperator,
            };
          })
        );

        return {
          ...order,
          nomor_invoice: penjualan?.nomor_invoice || undefined,
          pelanggan_nama: pelanggan?.nama || order.pelanggan_nama || undefined,
          items: itemsWithFinishing,
        };
      })
    );

    // Sort by priority (KILAT first) then by date
    return ordersWithItems.sort((a, b) => {
      if (a.prioritas === "KILAT" && b.prioritas !== "KILAT") return -1;
      if (a.prioritas !== "KILAT" && b.prioritas === "KILAT") return 1;
      return (
        new Date(b.dibuat_pada || 0).getTime() -
        new Date(a.dibuat_pada || 0).getTime()
      );
    });
  } catch (error) {
    console.error("Error fetching production orders:", error);
    throw error;
  }
}

/**
 * Get single production order by ID
 */
export async function getProductionOrderById(
  id: string
): Promise<ProductionOrder | null> {
  try {
    const orderResult = await db.queryOne<ProductionOrder>("order_produksi", {
      where: { id },
    });

    if (orderResult.error || !orderResult.data) {
      return null;
    }

    const order = orderResult.data;

    // Get penjualan
    const penjualanResult = await db.queryOne("penjualan", {
      where: { id: order.penjualan_id },
    });
    const penjualan = penjualanResult.data;

    // Get pelanggan if exists
    let pelanggan = null;
    if (penjualan?.pelanggan_id) {
      const pelangganResult = await db.queryOne("pelanggan", {
        where: { id: penjualan.pelanggan_id },
      });
      pelanggan = pelangganResult.data;
    }

    // Get items
    const itemsResult = await db.query<ProductionItem>("item_produksi", {
      where: { order_produksi_id: id },
      orderBy: { column: "dibuat_pada", ascending: true },
    });

    const items = itemsResult.data || [];

    // Get finishing and operator names
    const itemsWithFinishing = await Promise.all(
      items.map(async (item) => {
        const finishingResult = await db.query<FinishingItem>(
          "item_finishing",
          {
            where: { item_produksi_id: item.id },
            orderBy: { column: "dibuat_pada", ascending: true },
          }
        );

        const finishing = finishingResult.data || [];

        // Enrich finishing with operator names
        const finishingWithOperator = await Promise.all(
          finishing.map(async (fin) => {
            if (fin.operator_id) {
              const operatorResult = await db.queryOne("profil", {
                where: { id: fin.operator_id },
              });
              return {
                ...fin,
                operator_nama: operatorResult.data?.nama_pengguna || undefined,
              };
            }
            return fin;
          })
        );

        // Enrich item with operator name
        let operator_nama = undefined;
        if (item.operator_id) {
          const operatorResult = await db.queryOne("profil", {
            where: { id: item.operator_id },
          });
          operator_nama = operatorResult.data?.nama_pengguna || undefined;
        }

        return {
          ...item,
          operator_nama,
          finishing: finishingWithOperator,
        };
      })
    );

    return {
      ...order,
      nomor_invoice: penjualan?.nomor_invoice || undefined,
      pelanggan_nama: pelanggan?.nama || order.pelanggan_nama || undefined,
      items: itemsWithFinishing,
    };
  } catch (error) {
    console.error("Error fetching production order:", error);
    throw error;
  }
}

/**
 * Create new production order with items
 */
export async function createProductionOrder(data: {
  penjualan_id: string;
  items: Array<{
    item_penjualan_id: string;
    barang_nama: string;
    jumlah: number;
    nama_satuan: string;
    panjang?: number;
    lebar?: number;
    keterangan_dimensi?: string;
    mesin_printing?: string;
    jenis_bahan?: string;
    catatan_produksi?: string;
    finishing?: Array<{
      jenis_finishing: string;
      keterangan?: string;
    }>;
  }>;
  prioritas?: "NORMAL" | "KILAT";
  tanggal_deadline?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ id: string; nomor_spk: string }> {
  try {
    // Validate
    if (!data.penjualan_id?.trim()) {
      throw new Error("Penjualan ID harus diisi");
    }

    if (!data.items || data.items.length === 0) {
      throw new Error("Minimal harus ada 1 item produksi");
    }

    // Generate SPK number
    const lastOrderResult = await db.query("order_produksi", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit: 1,
    });

    let spkNumber = "SPK-0001";
    if (lastOrderResult.data && lastOrderResult.data.length > 0) {
      const lastOrder = lastOrderResult.data[0] as any;
      if (lastOrder.nomor_spk) {
        const lastNum = parseInt(lastOrder.nomor_spk.split("-")[1]);
        spkNumber = `SPK-${String(lastNum + 1).padStart(4, "0")}`;
      }
    }

    // Get pelanggan_nama from penjualan
    const penjualanResult = await db.queryOne("penjualan", {
      where: { id: data.penjualan_id },
    });
    const penjualan = penjualanResult.data;

    let pelanggan_nama = null;
    if (penjualan?.pelanggan_id) {
      const pelangganResult = await db.queryOne("pelanggan", {
        where: { id: penjualan.pelanggan_id },
      });
      pelanggan_nama = pelangganResult.data?.nama || null;
    }

    // Generate order ID
    const orderId = `OP-${Date.now()}`;

    // Create order_produksi
    const order = {
      id: orderId,
      penjualan_id: data.penjualan_id,
      nomor_spk: spkNumber,
      pelanggan_nama,
      total_item: data.items.length,
      status: "MENUNGGU" as const,
      prioritas: data.prioritas || ("NORMAL" as const),
      tanggal_deadline: data.tanggal_deadline || null,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: data.dibuat_oleh || null,
    };

    const orderResult = await db.insert("order_produksi", order);
    if (orderResult.error) {
      throw orderResult.error;
    }

    // Create item_produksi for each item
    for (const item of data.items) {
      const itemId = `IP-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const productionItem = {
        id: itemId,
        order_produksi_id: orderId,
        item_penjualan_id: item.item_penjualan_id,
        barang_nama: item.barang_nama,
        jumlah: item.jumlah,
        nama_satuan: item.nama_satuan,
        panjang: item.panjang || null,
        lebar: item.lebar || null,
        keterangan_dimensi: item.keterangan_dimensi?.trim() || null,
        mesin_printing: item.mesin_printing?.trim() || null,
        jenis_bahan: item.jenis_bahan?.trim() || null,
        status: "MENUNGGU" as const,
        catatan_produksi: item.catatan_produksi?.trim() || null,
      };

      const itemResult = await db.insert("item_produksi", productionItem);
      if (itemResult.error) {
        console.error("Failed to insert production item:", itemResult.error);
        throw itemResult.error;
      }

      // Create finishing items if any
      if (item.finishing && item.finishing.length > 0) {
        for (const fin of item.finishing) {
          const finId = `FIN-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;

          const finishingItem = {
            id: finId,
            item_produksi_id: itemId,
            jenis_finishing: fin.jenis_finishing,
            keterangan: fin.keterangan?.trim() || null,
            status: "MENUNGGU" as const,
          };

          const finResult = await db.insert("item_finishing", finishingItem);
          if (finResult.error) {
            console.error("Failed to insert finishing item:", finResult.error);
            throw finResult.error;
          }
        }
      }
    }

    return { id: orderId, nomor_spk: spkNumber };
  } catch (error: any) {
    console.error("Error creating production order:", error);
    throw error;
  }
}

/**
 * Update production order status
 */
export async function updateProductionOrderStatus(
  id: string,
  status: "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN"
): Promise<boolean> {
  try {
    const updateData: any = {
      status,
    };

    if (status === "SELESAI") {
      updateData.diselesaikan_pada = new Date().toISOString();
    }

    const result = await db.update("order_produksi", id, updateData);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error updating production order status:", error);
    throw error;
  }
}

/**
 * Update production item status
 */
export async function updateProductionItemStatus(
  itemId: string,
  data: {
    status: "MENUNGGU" | "PRINTING" | "FINISHING" | "SELESAI";
    operator_id?: string;
  }
): Promise<boolean> {
  try {
    const updateData: any = {
      status: data.status,
    };

    if (data.operator_id) {
      updateData.operator_id = data.operator_id;
    }

    // Set mulai_proses when starting PRINTING or FINISHING
    if (data.status === "PRINTING" || data.status === "FINISHING") {
      const itemResult = await db.queryOne("item_produksi", {
        where: { id: itemId },
      });

      if (itemResult.data && !itemResult.data.mulai_proses) {
        updateData.mulai_proses = new Date().toISOString();
      }
    }

    // Set selesai_proses when SELESAI
    if (data.status === "SELESAI") {
      updateData.selesai_proses = new Date().toISOString();
    }

    const result = await db.update("item_produksi", itemId, updateData);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error updating production item status:", error);
    throw error;
  }
}

/**
 * Delete production order (cascade delete items and finishing)
 */
export async function deleteProductionOrder(id: string): Promise<boolean> {
  try {
    // Get all items
    const itemsResult = await db.query("item_produksi", {
      where: { order_produksi_id: id },
    });

    const items = itemsResult.data || [];

    // Delete finishing items first
    for (const item of items) {
      const finishingResult = await db.query("item_finishing", {
        where: { item_produksi_id: item.id },
      });

      const finishingItems = finishingResult.data || [];
      for (const fin of finishingItems) {
        await db.delete("item_finishing", fin.id);
      }

      // Delete production item
      await db.delete("item_produksi", item.id);
    }

    // Delete production order
    const result = await db.delete("order_produksi", id);

    if (result.error) {
      throw result.error;
    }

    return true;
  } catch (error) {
    console.error("Error deleting production order:", error);
    throw error;
  }
}
