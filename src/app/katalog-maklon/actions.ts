"use server";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  createKatalogMaklon,
  listKatalogMaklon,
  updateKatalogMaklon,
  deleteKatalogMaklon,
  type KatalogMaklon,
} from "@/lib/services/katalog-maklon-service";
import type { KatalogMaklonInput } from "@/lib/schemas/katalog-maklon";

export async function listKatalogMaklonAction(onlyAktif = true): Promise<KatalogMaklon[]> {
  return listKatalogMaklon(onlyAktif);
}

export async function createKatalogMaklonAction(input: KatalogMaklonInput) {
  const s = await requireAdminOrManager();
  return createKatalogMaklon(input, s.uid);
}

export async function updateKatalogMaklonAction(id: string, input: KatalogMaklonInput) {
  await requireAdminOrManager();
  return updateKatalogMaklon(id, input);
}

export async function deleteKatalogMaklonAction(id: string) {
  await requireAdminOrManager();
  return deleteKatalogMaklon(id);
}
