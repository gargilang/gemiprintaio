"use server";

import { requireSession } from "@/lib/auth-guard-server";
import {
  jadikanPenawaranInputSchema,
  type ParkCartInput,
} from "@/lib/schemas/keranjang-tersimpan";
import {
  deleteParkedCart,
  jadikanPenawaran,
  listParkedCarts,
  loadParkedCart,
  markFinal,
  parkCart,
  type ParkedCart,
} from "@/lib/services/keranjang-tersimpan-service";
import type { QuotationItemInput } from "@/lib/services/quotation-service";

export async function listParkedCartsAction(): Promise<ParkedCart[]> {
  try {
    return await listParkedCarts();
  } catch (error) {
    console.error("Gagal listParkedCartsAction:", error);
    throw error;
  }
}

export async function loadParkedCartAction(
  id: string,
): Promise<ParkedCart | null> {
  try {
    return await loadParkedCart(id);
  } catch (error) {
    console.error("Gagal loadParkedCartAction:", error);
    throw error;
  }
}

export async function parkCartAction(
  input: ParkCartInput,
): Promise<ParkedCart> {
  try {
    const session = await requireSession();
    return await parkCart(input, session.uid);
  } catch (error) {
    console.error("Gagal parkCartAction:", error);
    throw error;
  }
}

export async function deleteParkedCartAction(id: string): Promise<void> {
  try {
    await requireSession();
    await deleteParkedCart(id);
  } catch (error) {
    console.error("Gagal deleteParkedCartAction:", error);
    throw error;
  }
}

export async function markFinalAction(id: string): Promise<void> {
  try {
    await requireSession();
    await markFinal(id);
  } catch (error) {
    console.error("Gagal markFinalAction:", error);
    throw error;
  }
}

export async function jadikanPenawaranAction(
  id: string,
  items: QuotationItemInput[],
  meta: {
    pelanggan_id?: string | null;
    pelanggan_nama_snapshot?: string | null;
    pelanggan_kota?: string | null;
    kena_ppn?: boolean;
    ppn_persen?: number;
    ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
    catatan?: string | null;
  } = {},
): Promise<{ penawaran_id: string; nomor_penawaran: string }> {
  try {
    const parsed = jadikanPenawaranInputSchema.safeParse({ items, meta });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    }
    const session = await requireSession();
    return await jadikanPenawaran(id, parsed.data.items as any, {
      ...(parsed.data.meta || {}),
      dibuatOleh: session.uid,
    });
  } catch (error) {
    console.error("Gagal jadikanPenawaranAction:", error);
    throw error;
  }
}
