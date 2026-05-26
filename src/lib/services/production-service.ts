/**
 * Production Service
 * Universal API for Production Orders on Tauri and Web
 */

import "server-only";

import { db, generateId, getCurrentTimestamp } from "../db-unified";
import { getBillableDimensionsForRoll } from "../roll-size-utils";
import {
  getRollVariants,
  postInventoryMovement,
  type RollVariant,
} from "./inventory-service";
import { getShopSettings } from "./shop-settings-service";

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
  barang_id?: string | null;
  barang_nama: string;
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
  recommended_roll_width_m?: number | null;
  roll_inventory_status?: "NOT_REQUIRED" | "PENDING" | "POSTED" | "VOIDED";
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
  consumption?: ProductionMaterialConsumption | null;
}

export interface ProductionMaterialConsumption {
  id: string;
  item_produksi_id: string;
  item_penjualan_id: string;
  barang_id: string;
  roll_variant_id: string;
  roll_width_m: number;
  linear_used_m: number;
  area_used_m2: number;
  billed_area_m2: number;
  waste_area_m2: number;
  movement_id?: string | null;
  waste_movement_id?: string | null;
  operator_id?: string | null;
  status: "POSTED" | "VOIDED";
  catatan?: string | null;
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
            const saleItemResult = await db.queryOne<any>("item_penjualan", {
              where: { id: item.item_penjualan_id },
            });
            const saleItem = saleItemResult.data;
            const consumptionResult = await db.query<any>(
              "production_material_consumptions",
              { where: { item_produksi_id: item.id } }
            );
            const consumption =
              (consumptionResult.data || []).find((row: any) => row.status === "POSTED") ||
              null;

            return {
              ...item,
              barang_id: (item as any).barang_id || saleItem?.barang_id || null,
              billed_panjang: (item as any).billed_panjang ?? saleItem?.billed_panjang ?? null,
              billed_lebar: (item as any).billed_lebar ?? saleItem?.billed_lebar ?? null,
              recommended_roll_width_m:
                (item as any).recommended_roll_width_m ??
                saleItem?.recommended_roll_width_m ??
                null,
              roll_inventory_status:
                (item as any).roll_inventory_status ||
                (saleItem?.roll_inventory_deferred ? "PENDING" : "NOT_REQUIRED"),
              operator_nama: operator?.nama_pengguna || undefined,
              finishing: finishingWithOperator,
              consumption,
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
        const saleItemResult = await db.queryOne<any>("item_penjualan", {
          where: { id: item.item_penjualan_id },
        });
        const saleItem = saleItemResult.data;
        const consumptionResult = await db.query<any>(
          "production_material_consumptions",
          { where: { item_produksi_id: item.id } }
        );
        const consumption =
          (consumptionResult.data || []).find((row: any) => row.status === "POSTED") ||
          null;

        return {
          ...item,
          barang_id: (item as any).barang_id || saleItem?.barang_id || null,
          billed_panjang: (item as any).billed_panjang ?? saleItem?.billed_panjang ?? null,
          billed_lebar: (item as any).billed_lebar ?? saleItem?.billed_lebar ?? null,
          recommended_roll_width_m:
            (item as any).recommended_roll_width_m ??
            saleItem?.recommended_roll_width_m ??
            null,
          roll_inventory_status:
            (item as any).roll_inventory_status ||
            (saleItem?.roll_inventory_deferred ? "PENDING" : "NOT_REQUIRED"),
          operator_nama,
          finishing: finishingWithOperator,
          consumption,
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
    barang_id?: string | null;
    barang_nama: string;
    jumlah: number;
    nama_satuan: string;
    panjang?: number;
    lebar?: number;
    billed_panjang?: number | null;
    billed_lebar?: number | null;
    recommended_roll_width_m?: number | null;
    roll_inventory_status?: "NOT_REQUIRED" | "PENDING" | "POSTED" | "VOIDED";
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

    // Generate SPK number using configurable settings
    const spkSettings = await getShopSettings();
    const spkPrefix = spkSettings.spk_prefix || "SPK";
    const spkFormat = spkSettings.spk_format || "PREFIX-SEQ";
    const spkReset = spkSettings.spk_reset || "never";
    const spkPadding = spkSettings.spk_padding ?? 4;
    const spkStartSeq = spkSettings.spk_start_seq ?? 1;

    const today = new Date().toISOString().slice(0, 10);
    let spkDatePart = "";
    if (spkFormat === "PREFIX-DATE-SEQ") {
      const d = today.replace(/-/g, "");
      if (spkReset === "daily") spkDatePart = d;
      else if (spkReset === "monthly") spkDatePart = d.slice(0, 6);
      else if (spkReset === "yearly") spkDatePart = d.slice(0, 4);
      else spkDatePart = d;
    }

    const lastOrderResult = await db.query("order_produksi", {
      orderBy: { column: "dibuat_pada", ascending: false },
      limit: 1,
    });

    let spkSeq = spkStartSeq;
    if (lastOrderResult.data && lastOrderResult.data.length > 0) {
      const lastOrder = lastOrderResult.data[0] as any;
      const lastNomor: string = lastOrder.nomor_spk || "";
      try {
        if (spkFormat === "PREFIX-DATE-SEQ") {
          const expectedStart = `${spkPrefix}-${spkDatePart}-`;
          if (lastNomor.startsWith(expectedStart)) {
            const n = parseInt(lastNomor.slice(expectedStart.length), 10);
            if (!isNaN(n)) spkSeq = n + 1;
          }
        } else {
          const expectedStart = `${spkPrefix}-`;
          if (lastNomor.startsWith(expectedStart)) {
            const n = parseInt(lastNomor.slice(expectedStart.length), 10);
            if (!isNaN(n)) spkSeq = n + 1;
          }
        }
      } catch {
        spkSeq = spkStartSeq;
      }
    }

    const spkSeqStr = String(spkSeq).padStart(Math.max(1, spkPadding), "0");
    let spkNumber: string;
    if (spkFormat === "PREFIX-DATE-SEQ") {
      spkNumber = `${spkPrefix}-${spkDatePart}-${spkSeqStr}`;
    } else {
      spkNumber = `${spkPrefix}-${spkSeqStr}`;
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
        barang_id: item.barang_id || null,
        barang_nama: item.barang_nama,
        jumlah: item.jumlah,
        nama_satuan: item.nama_satuan,
        panjang: item.panjang || null,
        lebar: item.lebar || null,
        billed_panjang: item.billed_panjang ?? null,
        billed_lebar: item.billed_lebar ?? null,
        recommended_roll_width_m: item.recommended_roll_width_m ?? null,
        roll_inventory_status: item.roll_inventory_status || "NOT_REQUIRED",
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

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function resolveProductionConsumptionContext(itemId: string): Promise<{
  item: any;
  saleItem: any;
  material: any;
}> {
  const itemResult = await db.queryOne<any>("item_produksi", {
    where: { id: itemId },
  });
  if (itemResult.error) throw itemResult.error;
  const item = itemResult.data;
  if (!item) throw new Error("Item produksi tidak ditemukan");

  const saleItemResult = await db.queryOne<any>("item_penjualan", {
    where: { id: item.item_penjualan_id },
  });
  if (saleItemResult.error) throw saleItemResult.error;
  const saleItem = saleItemResult.data;
  if (!saleItem) throw new Error("Item penjualan terkait tidak ditemukan");

  const materialResult = await db.queryOne<any>("barang", {
    where: { id: saleItem.barang_id },
  });
  if (materialResult.error) throw materialResult.error;
  const material = materialResult.data;
  if (!material) throw new Error("Barang produksi tidak ditemukan");

  return { item, saleItem, material };
}

export async function getRollVariantsForProductionItem(
  itemId: string
): Promise<RollVariant[]> {
  const { saleItem } = await resolveProductionConsumptionContext(itemId);
  return getRollVariants(saleItem.barang_id);
}

export async function postProductionMaterialConsumption(input: {
  item_produksi_id: string;
  roll_variant_id: string;
  linear_used_m?: number | null;
  operator_id?: string | null;
  catatan?: string | null;
}): Promise<ProductionMaterialConsumption> {
  const { item, saleItem, material } = await resolveProductionConsumptionContext(
    input.item_produksi_id
  );
  if (Number(material.lacak_inventori_status) === 0) {
    throw new Error("Barang ini tidak melacak inventori");
  }
  if (Number(saleItem.roll_inventory_deferred || 0) !== 1) {
    throw new Error("Item ini tidak membutuhkan konfirmasi roll produksi");
  }

  const existing = await db.query<any>("production_material_consumptions", {
    where: { item_produksi_id: input.item_produksi_id },
  });
  const active = (existing.data || []).find((row: any) => row.status === "POSTED");
  if (active) {
    throw new Error("Konsumsi bahan untuk item ini sudah diposting");
  }

  const variants = await getRollVariants(saleItem.barang_id);
  const variant = variants.find((row) => row.id === input.roll_variant_id);
  if (!variant) throw new Error("Varian roll tidak valid untuk barang ini");

  const rollWidth = positiveNumber(variant.lebar_m);
  const orderP = positiveNumber(saleItem.panjang ?? item.panjang);
  const orderL = positiveNumber(saleItem.lebar ?? item.lebar);
  const billedArea = positiveNumber(saleItem.jumlah);
  const suggested = orderP > 0 && orderL > 0
    ? getBillableDimensionsForRoll(orderP, orderL, rollWidth)
    : null;
  const suggestedLinear = suggested ? suggested.area / rollWidth : 0;
  const linearUsed = positiveNumber(input.linear_used_m) || suggestedLinear;
  if (linearUsed <= 0) throw new Error("Panjang aktual roll harus lebih dari 0");

  const areaUsed = rollWidth * linearUsed;
  const issueArea = billedArea > 0 ? Math.min(billedArea, areaUsed) : areaUsed;
  const wasteArea = Math.max(0, areaUsed - issueArea);
  const unitCost =
    positiveNumber(variant.average_cost_per_m2) ||
    positiveNumber(material.average_cost_per_base_unit);
  const consumptionId = generateId();
  const movementId = `mov-${consumptionId}`;
  const wasteMovementId = wasteArea > 0 ? `waste-${consumptionId}` : null;

  const issueMovement = await postInventoryMovement({
    id: movementId,
    barang_id: saleItem.barang_id,
    tanggal: new Date().toISOString().split("T")[0],
    movement_type: "PRODUCTION_ISSUE",
    qty_delta: -issueArea,
    unit_cost: unitCost,
    source_type: "PRODUCTION",
    source_id: item.order_produksi_id,
    source_line_id: item.id,
    roll_variant_id: variant.id,
    roll_width_m: rollWidth,
    linear_delta_m: -linearUsed,
    catatan: input.catatan?.trim() || `Konsumsi produksi ${item.barang_nama}`,
    dibuat_oleh: input.operator_id || null,
  });
  if (wasteArea > 0) {
    await postInventoryMovement({
      id: wasteMovementId!,
      barang_id: saleItem.barang_id,
      tanggal: new Date().toISOString().split("T")[0],
      movement_type: "PRODUCTION_WASTE",
      qty_delta: -wasteArea,
      unit_cost: unitCost,
      source_type: "PRODUCTION_WASTE",
      source_id: item.order_produksi_id,
      source_line_id: item.id,
      roll_variant_id: variant.id,
      roll_width_m: rollWidth,
      linear_delta_m: null,
      catatan: `Waste produksi dari ${item.barang_nama}`,
      dibuat_oleh: input.operator_id || null,
    });
  }

  const consumption = {
    id: consumptionId,
    item_produksi_id: item.id,
    item_penjualan_id: saleItem.id,
    barang_id: saleItem.barang_id,
    roll_variant_id: variant.id,
    roll_width_m: rollWidth,
    linear_used_m: linearUsed,
    area_used_m2: areaUsed,
    billed_area_m2: billedArea,
    waste_area_m2: wasteArea,
    movement_id: issueMovement?.id || movementId,
    waste_movement_id: wasteMovementId,
    operator_id: input.operator_id || null,
    status: "POSTED" as const,
    catatan: input.catatan?.trim() || null,
  };
  const ins = await db.insert("production_material_consumptions", consumption);
  if (ins.error) throw ins.error;

  const upd = await db.update("item_produksi", item.id, {
    status: "SELESAI",
    roll_inventory_status: "POSTED",
    operator_id: input.operator_id || item.operator_id || null,
    selesai_proses: getCurrentTimestamp(),
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;

  return consumption;
}

export async function voidProductionMaterialConsumption(
  consumptionId: string,
  reason = "Konsumsi produksi dibatalkan",
  actorId?: string | null
): Promise<boolean> {
  const rowResult = await db.queryOne<any>("production_material_consumptions", {
    where: { id: consumptionId },
  });
  if (rowResult.error) throw rowResult.error;
  const row = rowResult.data;
  if (!row) throw new Error("Konsumsi produksi tidak ditemukan");
  if (row.status === "VOIDED") return true;

  const movement = row.movement_id
    ? (await db.queryOne<any>("inventory_movements", { where: { id: row.movement_id } })).data
    : null;
  if (movement) {
    await postInventoryMovement({
      id: `void-${movement.id}`,
      barang_id: movement.barang_id,
      tanggal: new Date().toISOString().split("T")[0],
      movement_type: "ADJUSTMENT",
      qty_delta: Math.abs(Number(movement.qty_delta || 0)),
      unit_cost: Number(movement.unit_cost || 0),
      source_type: "PRODUCTION_CONSUMPTION_VOID",
      source_id: row.item_produksi_id,
      source_line_id: row.id,
      reversal_of_id: movement.id,
      roll_variant_id: movement.roll_variant_id || null,
      roll_width_m: movement.roll_width_m || null,
      linear_delta_m: movement.linear_delta_m
        ? Math.abs(Number(movement.linear_delta_m || 0))
        : null,
      catatan: reason,
      dibuat_oleh: actorId || null,
    });
  }

  const wasteMovement = row.waste_movement_id
    ? (await db.queryOne<any>("inventory_movements", { where: { id: row.waste_movement_id } })).data
    : null;
  if (wasteMovement) {
    await postInventoryMovement({
      id: `void-${wasteMovement.id}`,
      barang_id: wasteMovement.barang_id,
      tanggal: new Date().toISOString().split("T")[0],
      movement_type: "ADJUSTMENT",
      qty_delta: Math.abs(Number(wasteMovement.qty_delta || 0)),
      unit_cost: Number(wasteMovement.unit_cost || 0),
      source_type: "PRODUCTION_WASTE_VOID",
      source_id: row.item_produksi_id,
      source_line_id: row.id,
      reversal_of_id: wasteMovement.id,
      catatan: reason,
      dibuat_oleh: actorId || null,
    });
  }

  const upd = await db.update("production_material_consumptions", row.id, {
    status: "VOIDED",
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
  await db.update("item_produksi", row.item_produksi_id, {
    roll_inventory_status: "PENDING",
    status: "PRINTING",
    diperbarui_pada: getCurrentTimestamp(),
  });
  return true;
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
      const itemResult = await db.queryOne<any>("item_produksi", {
        where: { id: itemId },
      });
      const rollStatus = String(itemResult.data?.roll_inventory_status || "NOT_REQUIRED");
      if (rollStatus === "PENDING") {
        const existing = await db.query<any>("production_material_consumptions", {
          where: { item_produksi_id: itemId },
        });
        const hasPosted = (existing.data || []).some((row: any) => row.status === "POSTED");
        if (!hasPosted) {
          throw new Error(
            "Konfirmasi roll aktual dulu sebelum menandai item produksi selesai."
          );
        }
      }
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
