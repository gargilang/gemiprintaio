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
  const materialMap = new Map(materials.map((m: any) => [m.id, m.nama]));

  // Compute running balance per barang. The service returns rows ordered by
  // dibuat_pada DESC; we group by barang and replay forward to populate
  // qty_after / value if absent.
  const byBarang = new Map<string, any[]>();
  for (const movement of movements) {
    const list = byBarang.get(movement.barang_id) || [];
    list.push(movement);
    byBarang.set(movement.barang_id, list);
  }
  for (const [, list] of byBarang) {
    list.sort((a, b) => String(a.dibuat_pada || "").localeCompare(String(b.dibuat_pada || "")));
    let running = 0;
    for (const movement of list) {
      // Prefer the persisted qty_after when available.
      if (typeof movement.qty_after === "number" && Number.isFinite(movement.qty_after)) {
        running = movement.qty_after;
      } else {
        running += Number(movement.qty_delta || 0);
      }
      movement.running_balance = running;
    }
  }

  return {
    movements: movements.map((movement) => ({
      ...movement,
      barang_nama: materialMap.get(movement.barang_id) || movement.barang_id,
    })),
    materials,
  };
}

