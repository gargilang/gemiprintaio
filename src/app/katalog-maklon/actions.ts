"use server";
import {
  requireAdminOrManager,
  requireOperationalRole,
  requireSession,
} from "@/lib/auth-guard-server";
import {
  createKatalogMaklon,
  listKatalogMaklon,
  updateKatalogMaklon,
  deleteKatalogMaklon,
  type KatalogMaklon,
} from "@/lib/services/katalog-maklon-service";
import type { KatalogMaklonInput } from "@/lib/schemas/katalog-maklon";
import { getMaterialCategories } from "@/lib/services/materials-service";
import {
  listPendingMaklon,
  reconcilePendingMaklonItem,
  reconcilePendingMaklonInputSchema,
  type PendingMaklonRow,
  type ReconcilePendingMaklonInput,
} from "@/lib/services/pending-maklon-service";

export async function listKatalogMaklonAction(
  onlyAktif = true,
): Promise<KatalogMaklon[]> {
  return listKatalogMaklon(onlyAktif);
}

/** Ambil daftar kategori barang untuk dropdown kategori katalog. Baca saja. */
export async function getKategoriBarangAction() {
  await requireSession();
  return getMaterialCategories();
}

export async function createKatalogMaklonAction(input: KatalogMaklonInput) {
  const s = await requireAdminOrManager();
  return createKatalogMaklon(input, s.uid);
}

export async function updateKatalogMaklonAction(
  id: string,
  input: KatalogMaklonInput,
) {
  await requireAdminOrManager();
  return updateKatalogMaklon(id, input);
}

export async function deleteKatalogMaklonAction(id: string) {
  await requireAdminOrManager();
  return deleteKatalogMaklon(id);
}

/** Queue "Pending Vendor/HPP" — baca saja, cukup login. */
export async function listPendingMaklonAction(): Promise<PendingMaklonRow[]> {
  await requireSession();
  return listPendingMaklon();
}

/**
 * Reconcile baris maklon pending: isi vendor + biaya + metode bayar,
 * recompute HPP, post keuangan [REF:itemId], buat PO maklon.
 * Staf+ boleh reconcile (requireOperationalRole).
 */
export async function reconcilePendingMaklonItemAction(
  itemPenjualanId: string,
  input: ReconcilePendingMaklonInput,
): Promise<void> {
  const s = await requireOperationalRole();
  // Validasi ulang di lapisan action agar payload tidak tepercaya dari klien.
  const parsed = reconcilePendingMaklonInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await reconcilePendingMaklonItem(itemPenjualanId, {
    ...parsed.data,
    dibuat_oleh: s.uid,
  });
}
