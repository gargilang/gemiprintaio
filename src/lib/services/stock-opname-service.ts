import "server-only";

import { db, generateId } from "@/lib/db-unified";
import { getMaterials } from "@/lib/services/materials-service";
import {
  postInventoryMovement,
  getRollVariants,
} from "@/lib/services/inventory-service";
import {
  generateDailyDocumentNumber,
  numeric,
  todayJakarta,
} from "./document-number-service";
import { buildLookupMap, fetchChildrenByForeignKey } from "./enrich-utils";

async function enrichSessions(rows: any[]) {
  const sessionIds = rows.map((row) => row.id);
  const itemsBySession = await fetchChildrenByForeignKey<any>(
    "stock_opname_items",
    "stock_opname_id",
    sessionIds,
  );

  const barangIds = [...itemsBySession.values()]
    .flat()
    .map((item) => item.barang_id)
    .filter(Boolean);
  const barangMap = await buildLookupMap<{
    id: string;
    nama: string;
    satuan_dasar: string;
    butuh_dimensi_status: number;
  }>("barang", barangIds, "nama,satuan_dasar,butuh_dimensi_status");

  return rows.map((row) => ({
    ...row,
    items: (itemsBySession.get(row.id) || []).map((item) => {
      const barang = barangMap.get(item.barang_id);
      return {
        ...item,
        barang_nama: barang?.nama || "",
        satuan_dasar: barang?.satuan_dasar ?? "",
        butuh_dimensi_status: Number(barang?.butuh_dimensi_status ?? 0),
      };
    }),
  }));
}

export async function getStockOpnames(limit = 100) {
  const result = await db.query<any>("stock_opnames", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit,
  });
  if (result.error) throw result.error;
  return enrichSessions(result.data || []);
}

export async function getStockOpnameById(id: string) {
  const result = await db.queryOne<any>("stock_opnames", { where: { id } });
  if (result.error) throw result.error;
  if (!result.data) return null;
  const [session] = await enrichSessions([result.data]);
  return session;
}

export async function createStockOpname(input: {
  tanggal?: string;
  catatan?: string | null;
  dibuat_oleh?: string | null;
  barang_ids?: string[];
}) {
  const tanggal = input.tanggal || todayJakarta();
  const id = generateId();
  const nomor = await generateDailyDocumentNumber(
    "stock_opnames",
    "nomor_opname",
    "SO",
    tanggal,
  );
  const materials = await getMaterials();
  const selectedIds = input.barang_ids?.length
    ? new Set(input.barang_ids)
    : null;
  const tracked = materials.filter(
    (material: any) =>
      Number(material.lacak_inventori_status ?? 1) !== 0 &&
      (!selectedIds || selectedIds.has(material.id)),
  );

  await db.transaction(async () => {
    const header = await db.insert("stock_opnames", {
      id,
      nomor_opname: nomor,
      tanggal,
      status: "DRAFT",
      catatan: input.catatan?.trim() || null,
      dibuat_oleh: input.dibuat_oleh || null,
      total_items: tracked.length,
      total_delta_qty: 0,
      total_delta_value: 0,
    });
    if (header.error) throw header.error;

    for (const material of tracked) {
      const isDimensi = Number(material.butuh_dimensi_status) === 1;

      if (isDimensi) {
        // Untuk barang dimensi: satu baris per variant aktif
        const variants = await getRollVariants(material.id);
        const aktif = variants.filter((v) => Number(v.aktif_status) !== 0);

        if (aktif.length === 0) {
          // Fallback: satu baris agregat tanpa roll detail
          const row = await db.insert("stock_opname_items", {
            id: generateId(),
            stock_opname_id: id,
            barang_id: material.id,
            system_qty: numeric(material.jumlah_stok),
            counted_qty: null,
            delta_qty: 0,
            unit_cost: numeric(material.average_cost_per_base_unit),
            delta_value: 0,
            roll_variant_id: null,
            roll_width_m: null,
            system_linear_m: null,
            counted_linear_m: null,
            delta_linear_m: null,
          });
          if (row.error) throw row.error;
        } else {
          for (const variant of aktif) {
            const lebar = Number(variant.lebar_m);
            const panjang = Number(variant.panjang_tersedia_m);
            const systemQty = panjang * lebar; // m²
            const row = await db.insert("stock_opname_items", {
              id: generateId(),
              stock_opname_id: id,
              barang_id: material.id,
              system_qty: systemQty,
              counted_qty: null,
              delta_qty: 0,
              unit_cost: numeric(material.average_cost_per_base_unit),
              delta_value: 0,
              roll_variant_id: variant.id,
              roll_width_m: lebar,
              system_linear_m: panjang,
              counted_linear_m: null,
              delta_linear_m: null,
            });
            if (row.error) throw row.error;
          }
        }
      } else {
        // Non-dimensi: unchanged
        const row = await db.insert("stock_opname_items", {
          id: generateId(),
          stock_opname_id: id,
          barang_id: material.id,
          system_qty: numeric(material.jumlah_stok),
          counted_qty: null,
          delta_qty: 0,
          unit_cost: numeric(material.average_cost_per_base_unit),
          delta_value: 0,
          roll_variant_id: null,
          roll_width_m: null,
          system_linear_m: null,
          counted_linear_m: null,
          delta_linear_m: null,
        });
        if (row.error) throw row.error;
      }
    }
  });

  return { id, nomor_opname: nomor };
}

export async function updateStockOpnameCounts(
  id: string,
  items: Array<{
    stock_opname_item_id: string;
    counted_qty?: number;
    /** Untuk item dimensi (roll_variant_id != null): panjang fisik dalam meter. */
    counted_linear_m?: number;
    catatan?: string | null;
  }>,
) {
  const session = await getStockOpnameById(id);
  if (!session) throw new Error("Opname stok tidak ditemukan");
  if (session.status !== "DRAFT")
    throw new Error("Hanya opname DRAF yang bisa diedit");

  let totalDeltaQty = 0;
  let totalDeltaValue = 0;
  for (const input of items) {
    const existing = (session.items || []).find(
      (item: any) => item.id === input.stock_opname_item_id,
    );
    if (!existing) continue;

    let countedQty: number;
    let deltaLinearM: number | null = null;
    let countedLinearMVal: number | null = null;

    if (existing.roll_variant_id && input.counted_linear_m !== undefined) {
      // Item dimensi: hitung m² dari panjang meter
      const lebar = Number(existing.roll_width_m) || 1;
      countedLinearMVal = numeric(input.counted_linear_m);
      countedQty = countedLinearMVal * lebar;
      deltaLinearM = countedLinearMVal - numeric(existing.system_linear_m);
    } else {
      countedQty = numeric(
        input.counted_qty ?? input.counted_linear_m ?? existing.system_qty,
      );
    }

    const deltaQty = countedQty - numeric(existing.system_qty);
    const deltaValue = deltaQty * numeric(existing.unit_cost);

    const upd = await db.update("stock_opname_items", existing.id, {
      counted_qty: countedQty,
      counted_linear_m: countedLinearMVal,
      delta_qty: deltaQty,
      delta_linear_m: deltaLinearM,
      delta_value: deltaValue,
      catatan: input.catatan?.trim() || null,
    });
    if (upd.error) throw upd.error;
  }

  const fresh = await getStockOpnameById(id);
  for (const item of fresh?.items || []) {
    totalDeltaQty += numeric(item.delta_qty);
    totalDeltaValue += numeric(item.delta_value);
  }
  const updHeader = await db.update("stock_opnames", id, {
    total_delta_qty: totalDeltaQty,
    total_delta_value: totalDeltaValue,
  });
  if (updHeader.error) throw updHeader.error;
}

export async function postStockOpname(id: string, actorId?: string | null) {
  const session = await getStockOpnameById(id);
  if (!session) throw new Error("Opname stok tidak ditemukan");
  if (session.status !== "DRAFT")
    throw new Error("Opname stok sudah diposting/batal");

  let totalDeltaQty = 0;
  let totalDeltaValue = 0;

  // Validasi: tidak ada delta yang menyebabkan panjang_tersedia_m negatif
  for (const item of session.items || []) {
    if (!item.roll_variant_id) continue;
    const deltaLinear = numeric(item.delta_linear_m);
    if (Math.abs(deltaLinear) < 0.000001) continue;
    if (deltaLinear < 0) {
      // Pengurangan — cek apakah variant cukup stok
      const variantResult = await db.queryOne<any>("barang_roll_variants", {
        where: { id: item.roll_variant_id },
      });
      if (variantResult.error) throw variantResult.error;
      const variant = variantResult.data;
      if (!variant) continue;
      const setelahPosting = numeric(variant.panjang_tersedia_m) + deltaLinear;
      if (setelahPosting < -0.001) {
        const lebar = Number(item.roll_width_m).toFixed(2);
        const tersedia = Number(variant.panjang_tersedia_m).toFixed(2);
        const butuh = Math.abs(deltaLinear).toFixed(2);
        throw new Error(
          `Roll lebar ${lebar}m: stok tersedia ${tersedia}m, dibutuhkan ${butuh}m — ` +
            `periksa kembali hitungan fisik untuk barang ini.`,
        );
      }
    }
  }

  await db.transaction(async () => {
    for (const item of session.items || []) {
      const deltaQty = numeric(item.delta_qty);
      if (Math.abs(deltaQty) < 0.000001) continue;
      const movement = await postInventoryMovement({
        id: `mov-${item.id}`,
        barang_id: item.barang_id,
        tanggal: session.tanggal || todayJakarta(),
        movement_type: "ADJUSTMENT",
        qty_delta: deltaQty,
        unit_cost: numeric(item.unit_cost),
        source_type: "STOCK_OPNAME",
        source_id: id,
        source_line_id: item.id,
        catatan: item.catatan || `Stock opname ${session.nomor_opname}`,
        dibuat_oleh: actorId || null,
        roll_variant_id: item.roll_variant_id || null,
        roll_width_m: item.roll_width_m ? Number(item.roll_width_m) : null,
        linear_delta_m: item.delta_linear_m
          ? numeric(item.delta_linear_m)
          : null,
      });
      const upd = await db.update("stock_opname_items", item.id, {
        movement_id: movement?.id || null,
      });
      if (upd.error) throw upd.error;
      totalDeltaQty += deltaQty;
      totalDeltaValue += numeric(item.delta_value);
    }

    const updHeader = await db.update("stock_opnames", id, {
      status: "POSTED",
      posted_at: new Date().toISOString(),
      posted_by: actorId || null,
      total_delta_qty: totalDeltaQty,
      total_delta_value: totalDeltaValue,
    });
    if (updHeader.error) throw updHeader.error;
  });

  return {
    id,
    total_delta_qty: totalDeltaQty,
    total_delta_value: totalDeltaValue,
  };
}

export async function cancelStockOpname(id: string) {
  const session = await getStockOpnameById(id);
  if (!session) throw new Error("Opname stok tidak ditemukan");
  if (session.status !== "DRAFT")
    throw new Error("Hanya opname DRAF yang bisa dibatalkan");
  const upd = await db.update("stock_opnames", id, { status: "CANCELLED" });
  if (upd.error) throw upd.error;
}
