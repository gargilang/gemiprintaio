"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { getMaterials } from "@/lib/services/materials-service";
import {
  createInventoryAdjustment,
  createWasteMovement,
  getInventoryMovements,
} from "@/lib/services/inventory-service";

export async function getAdjustmentInitAction() {
  const [materials, movements] = await Promise.all([
    getMaterials(),
    getInventoryMovements({ source_type: "ADJUSTMENT" }),
  ]);
  const waste = await getInventoryMovements({ source_type: "WASTE" });
  return {
    materials,
    movements: [...movements, ...waste].sort((a, b) =>
      String(b.dibuat_pada || "").localeCompare(String(a.dibuat_pada || ""))
    ),
  };
}

export async function createInventoryAdjustmentAction(
  input: Parameters<typeof createInventoryAdjustment>[0]
) {
  const s = await requireAdminOrManager();
  return createInventoryAdjustment({ ...input, dibuat_oleh: s.uid });
}

export async function createWasteMovementAction(
  input: Parameters<typeof createWasteMovement>[0]
) {
  const s = await requireAdminOrManager();
  return createWasteMovement({ ...input, dibuat_oleh: s.uid });
}

