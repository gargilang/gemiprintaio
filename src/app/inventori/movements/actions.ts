"use server";

import {
  getInventoryMovements,
  type InventoryMovementType,
} from "@/lib/services/inventory-service";
import { getMaterials } from "@/lib/services/materials-service";

export async function getMovementLedgerAction(filters: {
  barang_id?: string;
  source_id?: string;
  source_type?: string;
  movement_type?: InventoryMovementType;
  date_from?: string;
  date_to?: string;
  reference?: string;
}) {
  const [movements, materials] = await Promise.all([
    getInventoryMovements(filters),
    getMaterials(),
  ]);

  // Map barang_id → data tampilan (nama, satuan, dimensi)
  const materialMap = new Map(
    materials.map((m: any) => [
      m.id,
      {
        nama: m.nama,
        satuan_dasar: m.satuan_dasar ?? "",
        butuh_dimensi_status: Number(m.butuh_dimensi_status),
      },
    ]),
  );

  // Hitung running balance per barang (replay forward dari urutan waktu)
  const byBarang = new Map<string, any[]>();
  for (const movement of movements) {
    const list = byBarang.get(movement.barang_id) || [];
    list.push(movement);
    byBarang.set(movement.barang_id, list);
  }
  for (const [, list] of byBarang) {
    list.sort((a, b) =>
      String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")),
    );
    let running = 0;
    for (const movement of list) {
      if (
        typeof movement.qty_after === "number" &&
        Number.isFinite(movement.qty_after)
      ) {
        running = movement.qty_after;
      } else {
        running += Number(movement.qty_delta || 0);
      }
      movement.running_balance = running;
    }
  }

  return {
    movements: movements.map((movement) => {
      const mat = materialMap.get(movement.barang_id);
      return {
        ...movement,
        barang_nama: mat?.nama || movement.barang_id,
        satuan_dasar: mat?.satuan_dasar ?? "",
        butuh_dimensi_status: mat?.butuh_dimensi_status ?? 0,
      };
    }),
    materials,
  };
}
