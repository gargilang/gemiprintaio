"use server";

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  cancelStockOpname,
  createStockOpname,
  deleteStockOpname,
  getStockOpnames,
  postStockOpname,
  updateStockOpnameCounts,
} from "@/lib/services/stock-opname-service";

export async function getStockOpnamesAction() {
  return getStockOpnames();
}

export async function createStockOpnameAction(
  input: Parameters<typeof createStockOpname>[0]
) {
  const s = await requireAdminOrManager();
  return createStockOpname({ ...input, dibuat_oleh: s.uid });
}

export async function updateStockOpnameCountsAction(
  id: string,
  items: Parameters<typeof updateStockOpnameCounts>[1]
) {
  await requireAdminOrManager();
  return updateStockOpnameCounts(id, items);
}

export async function postStockOpnameAction(id: string) {
  const s = await requireAdminOrManager();
  return postStockOpname(id, s.uid);
}

export async function cancelStockOpnameAction(id: string) {
  await requireAdminOrManager();
  return cancelStockOpname(id);
}

export async function deleteStockOpnameAction(id: string) {
  await requireAdminOrManager();
  return deleteStockOpname(id);
}

