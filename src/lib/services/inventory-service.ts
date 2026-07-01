import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { isDateInClosedPeriod } from "./accounting-periods-service";

export type InventoryMovementType =
  | "OPENING_BALANCE"
  | "PURCHASE_RECEIPT"
  | "SALE_ISSUE"
  | "SALE_VOID"
  | "SALE_RETURN"
  | "PURCHASE_VOID"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT"
  | "WASTE"
  | "ROLL_CONVERSION_OUT"
  | "ROLL_CONVERSION_IN"
  | "PRODUCTION_ISSUE"
  | "PRODUCTION_WASTE";

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
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
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
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
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
  return ![
    "SALE_ISSUE",
    "WASTE",
    "PRODUCTION_ISSUE",
    "PRODUCTION_WASTE",
  ].includes(type);
}

export interface RollVariant {
  id: string;
  barang_id: string;
  lebar_m: number;
  panjang_tersedia_m: number;
  average_cost_per_m2: number;
  aktif_status: number;
  catatan?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

async function syncUnitPurchasePricesFromAverage(
  barangId: string,
  averageCostPerBaseUnit: number,
): Promise<void> {
  const upsRes = await db.query<{ id: string; faktor_konversi: number }>(
    "harga_barang_satuan",
    { where: { barang_id: barangId } },
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

export async function getRollVariants(
  barangId?: string,
): Promise<RollVariant[]> {
  const result = await db.query<RollVariant>("barang_roll_variants", {
    ...(barangId ? { where: { barang_id: barangId } } : {}),
    orderBy: { column: "lebar_m", ascending: true },
  });
  if (result.error) throw result.error;
  return (result.data || []).filter(
    (row: any) => Number(row.aktif_status) !== 0,
  );
}

export async function findOrCreateRollVariant(input: {
  barang_id: string;
  lebar_m: number;
  average_cost_per_m2?: number | null;
  catatan?: string | null;
}): Promise<RollVariant> {
  const width = Number(input.lebar_m);
  if (!input.barang_id || !Number.isFinite(width) || width <= 0) {
    throw new Error("Barang dan lebar roll wajib valid");
  }

  const existing = await db.query<RollVariant>("barang_roll_variants", {
    where: { barang_id: input.barang_id },
    orderBy: { column: "lebar_m", ascending: true },
  });
  if (existing.error) throw existing.error;
  const found = (existing.data || []).find(
    (row: any) => Math.abs(Number(row.lebar_m) - width) < 0.000001,
  );
  if (found) {
    if (Number(found.aktif_status) === 0) {
      const upd = await db.update("barang_roll_variants", found.id, {
        aktif_status: 1,
        diperbarui_pada: getCurrentTimestamp(),
      });
      if (upd.error) throw upd.error;
      return { ...found, aktif_status: 1 };
    }
    return found;
  }

  const id = generateId();
  const row = {
    id,
    barang_id: input.barang_id,
    lebar_m: width,
    panjang_tersedia_m: 0,
    average_cost_per_m2: positiveNumber(input.average_cost_per_m2),
    aktif_status: 1,
    catatan: input.catatan || null,
  };
  const ins = await db.insert("barang_roll_variants", row);
  if (ins.error) throw ins.error;
  await db.update("barang", input.barang_id, {
    roll_inventory_status: 1,
    diperbarui_pada: getCurrentTimestamp(),
  });
  return row as RollVariant;
}

async function updateRollVariantFromMovement(input: {
  roll_variant_id?: string | null;
  linear_delta_m?: number | null;
  unit_cost: number;
}): Promise<void> {
  if (
    !input.roll_variant_id ||
    !Number.isFinite(Number(input.linear_delta_m))
  ) {
    return;
  }
  const linearDelta = Number(input.linear_delta_m);
  if (Math.abs(linearDelta) < 0.000001) return;

  const variantResult = await db.queryOne<RollVariant>("barang_roll_variants", {
    where: { id: input.roll_variant_id },
  });
  if (variantResult.error) throw variantResult.error;
  const variant = variantResult.data as RollVariant | null;
  if (!variant) {
    throw new Error("Varian roll tidak ditemukan");
  }

  const width = positiveNumber(variant.lebar_m);
  const beforeLength = numeric(variant.panjang_tersedia_m);
  const afterLength = beforeLength + linearDelta;
  if (afterLength < -0.000001) {
    throw new Error(
      `Stok roll ${width.toLocaleString("id-ID")}m tidak cukup. Panjang tersedia ${beforeLength.toLocaleString(
        "id-ID",
      )}m, dibutuhkan ${Math.abs(linearDelta).toLocaleString("id-ID")}m.`,
    );
  }

  const beforeArea = beforeLength * width;
  const deltaArea = linearDelta * width;
  const afterArea = Math.max(0, afterLength) * width;
  const avgBefore = numeric(variant.average_cost_per_m2);
  let avgAfter = avgBefore;
  if (deltaArea > 0) {
    avgAfter =
      afterArea > 0
        ? Math.max(
            0,
            (beforeArea * avgBefore + deltaArea * input.unit_cost) / afterArea,
          )
        : 0;
  } else if (afterArea <= 0) {
    avgAfter = 0;
  }

  const upd = await db.update("barang_roll_variants", variant.id, {
    panjang_tersedia_m: Math.abs(afterLength) < 0.000001 ? 0 : afterLength,
    average_cost_per_m2: avgAfter,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
}

export async function postInventoryMovement(
  input: PostInventoryMovementInput,
): Promise<InventoryMovement | null> {
  if (!input.barang_id) {
    throw new Error("Barang wajib diisi untuk pergerakan stok");
  }
  if (
    !Number.isFinite(Number(input.qty_delta)) ||
    Number(input.qty_delta) === 0
  ) {
    throw new Error("Jumlah pergerakan stok tidak boleh 0");
  }

  // Period guard: tolak pergerakan stok yang tanggalnya jatuh di periode TUTUP.
  // Postgres RPC sudah cek lewat `assert_period_open`, tapi jalur SQLite/
  // Tauri tidak melalui RPC, jadi cek di TS supaya mode offline juga aman.
  if (input.tanggal && (await isDateInClosedPeriod(input.tanggal))) {
    throw new Error(
      `Tanggal ${input.tanggal} jatuh di periode yang sudah ditutup. Gunakan jurnal pembalik di periode berjalan.`,
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
        "id-ID",
      )}, dibutuhkan ${Math.abs(qtyDelta).toLocaleString("id-ID")}.`,
    );
  }
  if (Math.abs(qtyAfter) < 0.000001) qtyAfter = 0;

  if (input.roll_variant_id && Number.isFinite(Number(input.linear_delta_m))) {
    const variantResult = await db.queryOne<RollVariant>(
      "barang_roll_variants",
      {
        where: { id: input.roll_variant_id },
      },
    );
    if (variantResult.error) throw variantResult.error;
    const variant = variantResult.data as RollVariant | null;
    if (!variant) throw new Error("Varian roll tidak ditemukan");
    const linearDelta = Number(input.linear_delta_m);
    const variantAfter = numeric(variant.panjang_tersedia_m) + linearDelta;
    if (variantAfter < -0.000001) {
      throw new Error(
        `Stok roll ${Number(variant.lebar_m).toLocaleString("id-ID")}m tidak cukup. Panjang tersedia ${Number(
          variant.panjang_tersedia_m || 0,
        ).toLocaleString(
          "id-ID",
        )}m, dibutuhkan ${Math.abs(linearDelta).toLocaleString("id-ID")}m.`,
      );
    }
  }

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
    roll_variant_id: input.roll_variant_id || null,
    roll_width_m: input.roll_width_m ?? null,
    linear_delta_m: input.linear_delta_m ?? null,
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

  await updateRollVariantFromMovement({
    roll_variant_id: input.roll_variant_id || null,
    linear_delta_m: input.linear_delta_m ?? null,
    unit_cost: unitCost,
  });

  await syncUnitPurchasePricesFromAverage(input.barang_id, avgAfter);
  return movement;
}

export async function getInventoryMovements(
  filters: {
    barang_id?: string;
    source_id?: string;
    source_type?: string;
    movement_type?: InventoryMovementType;
    date_from?: string;
    date_to?: string;
    reference?: string;
  } = {},
): Promise<InventoryMovement[]> {
  const where: Record<string, string> = {};
  if (filters.barang_id) where.barang_id = filters.barang_id;
  if (filters.source_id) where.source_id = filters.source_id;
  if (filters.source_type) where.source_type = filters.source_type;
  if (filters.movement_type) where.movement_type = filters.movement_type;

  const result = await db.query<InventoryMovement>("inventory_movements", {
    where,
    orderBy: { column: "dibuat_pada", ascending: false },
  });
  if (result.error) throw result.error;
  let rows = result.data || [];
  if (filters.date_from) {
    rows = rows.filter(
      (row) => String(row.tanggal || "") >= filters.date_from!,
    );
  }
  if (filters.date_to) {
    rows = rows.filter((row) => String(row.tanggal || "") <= filters.date_to!);
  }
  if (filters.reference?.trim()) {
    const needle = filters.reference.trim().toLowerCase();
    rows = rows.filter((row) =>
      [
        row.source_type,
        row.source_id,
        row.source_line_id,
        row.catatan,
        row.movement_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }
  return rows;
}

export type StockAdjustmentReason = "MANUAL" | "WASTE" | "CORRECTION";

export async function createInventoryAdjustment(input: {
  barang_id: string;
  qty_delta: number;
  reason: string;
  adjustment_reason?: StockAdjustmentReason;
  unit_cost?: number | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
  /** Opsional — hanya untuk barang dimensi */
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  linear_delta_m?: number | null;
}): Promise<InventoryMovement | null> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan penyesuaian stok wajib diisi");
  }

  const reasonCode = (input.adjustment_reason || "MANUAL").toUpperCase();
  const note = `[${reasonCode}] ${input.reason.trim()}`;

  return postInventoryMovement({
    barang_id: input.barang_id,
    tanggal: input.tanggal || new Date().toISOString().split("T")[0],
    movement_type: "ADJUSTMENT",
    qty_delta: input.qty_delta,
    unit_cost: input.unit_cost ?? null,
    source_type: "ADJUSTMENT",
    source_id: generateId(),
    catatan: note,
    dibuat_oleh: input.dibuat_oleh || null,
    roll_variant_id: input.roll_variant_id ?? null,
    roll_width_m: input.roll_width_m ?? null,
    linear_delta_m: input.linear_delta_m ?? null,
  });
}

/**
 * Catat barang rusak/scrap (misprint, sisa potongan yang tidak terpakai,
 * dll). Selalu mengurangi stok (qty_delta negatif). Tidak revalue AVCO —
 * barang dianggap hilang dengan nilai average cost saat ini, sehingga
 * sisa stok tetap pada cost yang sama dan biaya scrap masuk ke value_delta
 * untuk laporan biaya operasional.
 */
export async function createWasteMovement(input: {
  barang_id: string;
  qty: number;
  reason: string;
  tanggal?: string;
  dibuat_oleh?: string | null;
  /** Opsional — hanya untuk barang dimensi */
  roll_variant_id?: string | null;
  roll_width_m?: number | null;
  /** linear_delta_m harus positif; service akan membalik ke negatif */
  linear_delta_m?: number | null;
}): Promise<InventoryMovement | null> {
  if (!input.reason?.trim()) {
    throw new Error("Alasan/keterangan barang rusak wajib diisi");
  }
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Jumlah barang rusak harus lebih dari 0");
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
    roll_variant_id: input.roll_variant_id ?? null,
    roll_width_m: input.roll_width_m ?? null,
    // linear_delta_m dari caller selalu positif; WASTE mengurangi stok → negatif
    linear_delta_m:
      input.linear_delta_m != null
        ? -Math.abs(Number(input.linear_delta_m))
        : null,
  });
}

export async function convertRollVariant(input: {
  source_roll_variant_id: string;
  target_widths_m: number[];
  length_m?: number | null;
  reason?: string | null;
  tanggal?: string;
  dibuat_oleh?: string | null;
}): Promise<{
  ok: true;
  source_width_m: number;
  length_m: number;
  target_widths_m: number[];
}> {
  if (!input.source_roll_variant_id) {
    throw new Error("Varian roll sumber wajib dipilih");
  }
  const sourceResult = await db.queryOne<RollVariant>("barang_roll_variants", {
    where: { id: input.source_roll_variant_id },
  });
  if (sourceResult.error) throw sourceResult.error;
  const source = sourceResult.data as RollVariant | null;
  if (!source) throw new Error("Varian roll sumber tidak ditemukan");

  const targets = (input.target_widths_m || [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (targets.length === 0)
    throw new Error("Minimal satu lebar roll tujuan wajib diisi");
  const targetTotalWidth = targets.reduce((sum, width) => sum + width, 0);
  const sourceWidth = positiveNumber(source.lebar_m);
  if (Math.abs(targetTotalWidth - sourceWidth) > 0.000001) {
    throw new Error(
      `Total lebar tujuan (${targetTotalWidth.toLocaleString("id-ID")}m) harus sama dengan lebar sumber (${sourceWidth.toLocaleString("id-ID")}m).`,
    );
  }

  const length =
    positiveNumber(input.length_m) || numeric(source.panjang_tersedia_m);
  if (length <= 0)
    throw new Error("Panjang roll yang dikonversi harus lebih dari 0");
  if (length > numeric(source.panjang_tersedia_m) + 0.000001) {
    throw new Error("Panjang konversi melebihi stok roll sumber");
  }

  const unitCost = numeric(source.average_cost_per_m2);
  const tanggal = input.tanggal || new Date().toISOString().split("T")[0];
  const conversionId = generateId();
  const note =
    input.reason?.trim() ||
    `Konversi roll ${sourceWidth}m menjadi ${targets.join("m + ")}m`;

  await postInventoryMovement({
    id: `${conversionId}-out`,
    barang_id: source.barang_id,
    tanggal,
    movement_type: "ROLL_CONVERSION_OUT",
    qty_delta: -(sourceWidth * length),
    unit_cost: unitCost,
    source_type: "ROLL_CONVERSION",
    source_id: conversionId,
    source_line_id: source.id,
    roll_variant_id: source.id,
    roll_width_m: sourceWidth,
    linear_delta_m: -length,
    catatan: note,
    dibuat_oleh: input.dibuat_oleh || null,
  });

  for (let i = 0; i < targets.length; i++) {
    const targetWidth = targets[i];
    const target = await findOrCreateRollVariant({
      barang_id: source.barang_id,
      lebar_m: targetWidth,
      average_cost_per_m2: unitCost,
      catatan: `Hasil ${note}`,
    });
    await postInventoryMovement({
      id: `${conversionId}-in-${i}`,
      barang_id: source.barang_id,
      tanggal,
      movement_type: "ROLL_CONVERSION_IN",
      qty_delta: targetWidth * length,
      unit_cost: unitCost,
      source_type: "ROLL_CONVERSION",
      source_id: conversionId,
      source_line_id: target.id,
      roll_variant_id: target.id,
      roll_width_m: targetWidth,
      linear_delta_m: length,
      catatan: note,
      dibuat_oleh: input.dibuat_oleh || null,
    });
  }

  return {
    ok: true,
    source_width_m: sourceWidth,
    length_m: length,
    target_widths_m: targets,
  };
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
      throw new Error(
        `Ledger stok ${barangId} tidak valid: stok menjadi negatif`,
      );
    }
    if (shouldRevalueAverage(movement.movement_type)) {
      avg =
        nextQty > 0 ? Math.max(0, (qty * avg + delta * unitCost) / nextQty) : 0;
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
