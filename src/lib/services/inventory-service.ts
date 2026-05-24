import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { isDateInClosedPeriod } from "./accounting-periods-service";

export type InventoryMovementType =
  | "OPENING_BALANCE"
  | "PURCHASE_RECEIPT"
  | "SALE_ISSUE"
  | "SALE_VOID"
  | "PURCHASE_VOID"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT"
  | "WASTE";

export interface InventoryMovement {
  id: string;
  barang_id: string;
  tanggal: string;
  movement_type: InventoryMovementType;
  qty_delta: number;
  unit_cost: number;
  value_delta: number;
  qty_before: number;
  qty_after: number;
  avg_cost_before: number;
  avg_cost_after: number;
  source_type: string;
  source_id: string;
  source_line_id?: string | null;
  reversal_of_id?: string | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  dibuat_pada?: string;
}

export interface PostInventoryMovementInput {
  id?: string;
  barang_id: string;
  tanggal: string;
  movement_type: InventoryMovementType;
  qty_delta: number;
  unit_cost?: number | null;
  source_type: string;
  source_id: string;
  source_line_id?: string | null;
  reversal_of_id?: string | null;
  catatan?: string | null;
  dibuat_oleh?: string | null;
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shouldRevalueAverage(type: InventoryMovementType): boolean {
  return type !== "SALE_ISSUE";
}

async function syncUnitPurchasePricesFromAverage(
  barangId: string,
  averageCostPerBaseUnit: number
): Promise<void> {
  const upsRes = await db.query<{ id: string; faktor_konversi: number }>(
    "harga_barang_satuan",
    { where: { barang_id: barangId } }
  );
  if (upsRes.error) throw upsRes.error;

  for (const up of upsRes.data || []) {
    const faktor = positiveNumber(up.faktor_konversi) || 1;
    const upd = await db.update("harga_barang_satuan", up.id, {
      harga_beli: averageCostPerBaseUnit * faktor,
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (upd.error) throw upd.error;
  }
}

export async function postInventoryMovement(
  input: PostInventoryMovementInput
): Promise<InventoryMovement | null> {
  if (!input.barang_id) {
    throw new Error("Barang wajib diisi untuk pergerakan stok");
  }
  if (!Number.isFinite(Number(input.qty_delta)) || Number(input.qty_delta) === 0) {
    throw new Error("Jumlah pergerakan stok tidak boleh 0");
  }

  // Period guard: tolak movement yang tanggalnya jatuh di periode CLOSED.
  // Postgres RPC sudah cek lewat `assert_period_open`, tapi path SQLite/
  // Tauri tidak melalui RPC, jadi cek di TS supaya offline-mode juga aman.
  if (input.tanggal && (await isDateInClosedPeriod(input.tanggal))) {
    throw new Error(
      `Tanggal ${input.tanggal} jatuh di periode yang sudah ditutup. Gunakan jurnal pembalik di periode berjalan.`
    );
  }

  const materialResult = await db.queryOne<any>("barang", {
    where: { id: input.barang_id },
  });
  if (materialResult.error) throw materialResult.error;
  const material = materialResult.data;
  if (!material) {
    throw new Error(`Barang tidak ditemukan: ${input.barang_id}`);
  }

  if (Number(material.lacak_inventori_status) === 0) {
    return null;
  }

  const qtyDelta = Number(input.qty_delta);
  const qtyBefore = numeric(material.jumlah_stok);
  const avgBefore = numeric(material.average_cost_per_base_unit);
  const unitCost = positiveNumber(input.unit_cost) || avgBefore;
  let qtyAfter = qtyBefore + qtyDelta;

  if (qtyAfter < -0.000001) {
    throw new Error(
      `Stok tidak cukup untuk ${material.nama || "barang ini"}. Stok tersedia ${qtyBefore.toLocaleString(
        "id-ID"
      )}, dibutuhkan ${Math.abs(qtyDelta).toLocaleString("id-ID")}.`
    );
  }
  if (Math.abs(qtyAfter) < 0.000001) qtyAfter = 0;

  let avgAfter = avgBefore;
  if (shouldRevalueAverage(input.movement_type)) {
    avgAfter =
      qtyAfter > 0
        ? Math.max(0, (qtyBefore * avgBefore + qtyDelta * unitCost) / qtyAfter)
        : 0;
  } else if (qtyAfter <= 0) {
    avgAfter = 0;
  }

  const movement: InventoryMovement = {
    id: input.id || generateId(),
    barang_id: input.barang_id,
    tanggal: input.tanggal,
    movement_type: input.movement_type,
    qty_delta: qtyDelta,
    unit_cost: unitCost,
    value_delta: qtyDelta * unitCost,
    qty_before: qtyBefore,
    qty_after: qtyAfter,
    avg_cost_before: avgBefore,
    avg_cost_after: avgAfter,
    source_type: input.source_type,
    source_id: input.source_id,
    source_line_id: input.source_line_id || null,
    reversal_of_id: input.reversal_of_id || null,
    catatan: input.catatan || null,
    dibuat_oleh: input.dibuat_oleh || null,
  };

  const ins = await db.insert("inventory_movements", movement);
  if (ins.error) throw ins.error;

  const upd = await db.update("barang", input.barang_id, {
    jumlah_stok: qtyAfter,
    average_cost_per_base_unit: avgAfter,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;

  await syncUnitPurchasePricesFromAverage(input.barang_id, avgAfter);
  return movement;
}

export async function getInventoryMovements(filters: {
  barang_id?: string;
  source_id?: string;
  source_type?: string;
} = {}): Promise<InventoryMovement[]> {
  const where: Record<string, string> = {};
  if (filters.barang_id) where.barang_id = filters.barang_id;
  if (filters.source_id) where.source_id = filters.source_id;
  if (filters.source_type) where.source_type = filters.source_type;

  const result = await db.query<InventoryMovement>("inventory_movements", {
    where,
    orderBy: { column: "dibuat_pada", ascending: false },
  });
  if (result.error) throw result.error;
  return result.data || [];
}

export async function createInventoryAdjustment(input: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
}): Promise<InventoryMovement | null> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan adjustment stok wajib diisi");
  }

  return postInventoryMovement({
    barang_id: input.barang_id,
    tanggal: input.tanggal || new Date().toISOString().split("T")[0],
    movement_type: "ADJUSTMENT",
    qty_delta: input.qty_delta,
    unit_cost: input.unit_cost ?? null,
    source_type: "ADJUSTMENT",
    source_id: generateId(),
    catatan: input.reason.trim(),
    dibuat_oleh: input.dibuat_oleh || null,
  });
}

/**
 * Catat material rusak/scrap (misprint, sisa potongan yang tidak terpakai,
 * dll). Selalu mengurangi stok (qty_delta negatif). Tidak revalue AVCO —
 * material dianggap hilang dengan nilai average cost saat ini, sehingga
 * sisa stok tetap pada cost yang sama dan biaya scrap masuk ke value_delta
 * untuk laporan biaya operasional.
 */
export async function createWasteMovement(input: {
  barang_id: string;
  qty: number;
  reason: string;
  tanggal?: string;
  dibuat_oleh?: string | null;
}): Promise<InventoryMovement | null> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan/keterangan material rusak wajib diisi");
  }
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Jumlah material rusak harus lebih dari 0");
  }

  return postInventoryMovement({
    barang_id: input.barang_id,
    tanggal: input.tanggal || new Date().toISOString().split("T")[0],
    movement_type: "WASTE",
    qty_delta: -qty,
    unit_cost: null, // pakai avg cost current — service akan pick avgBefore
    source_type: "WASTE",
    source_id: generateId(),
    catatan: input.reason.trim(),
    dibuat_oleh: input.dibuat_oleh || null,
  });
}

export async function rebuildInventoryBalance(barangId: string): Promise<{
  jumlah_stok: number;
  average_cost_per_base_unit: number;
}> {
  const result = await db.query<InventoryMovement>("inventory_movements", {
    where: { barang_id: barangId },
    orderBy: { column: "dibuat_pada", ascending: true },
  });
  if (result.error) throw result.error;

  let qty = 0;
  let avg = 0;
  for (const movement of result.data || []) {
    const delta = numeric(movement.qty_delta);
    const unitCost = positiveNumber(movement.unit_cost) || avg;
    const nextQty = qty + delta;
    if (nextQty < -0.000001) {
      throw new Error(`Ledger stok ${barangId} tidak valid: stok menjadi negatif`);
    }
    if (shouldRevalueAverage(movement.movement_type)) {
      avg =
        nextQty > 0
          ? Math.max(0, (qty * avg + delta * unitCost) / nextQty)
          : 0;
    } else if (nextQty <= 0) {
      avg = 0;
    }
    qty = Math.abs(nextQty) < 0.000001 ? 0 : nextQty;
  }

  const upd = await db.update("barang", barangId, {
    jumlah_stok: qty,
    average_cost_per_base_unit: avg,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
  await syncUnitPurchasePricesFromAverage(barangId, avg);

  return {
    jumlah_stok: qty,
    average_cost_per_base_unit: avg,
  };
}

