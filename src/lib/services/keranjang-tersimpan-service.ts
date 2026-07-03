import "server-only";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import { parkCartInputSchema, type ParkCartInput } from "@/lib/schemas/keranjang-tersimpan";
import { createQuotation, type QuotationItemInput } from "@/lib/services/quotation-service";

export interface ParkedCart {
  id: string;
  label: string;
  pelanggan_id: string | null;
  pelanggan_nama_snapshot: string | null;
  pelanggan_kota: string | null;
  prioritas: "NORMAL" | "KILAT";
  ppn_snapshot: unknown;
  cart_snapshot: unknown;
  status: "AKTIF" | "KEDALUWARSA" | "JADIKAN_PENAWARAN" | "FINAL";
  penawaran_id: string | null;
  kedaluwarsa_pada: string;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function parkCart(input: ParkCartInput, kasirId: string): Promise<ParkedCart> {
  const parsed = parkCartInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  const id = generateId();
  const now = getCurrentTimestamp();
  const kedaluwarsa = addDaysIso(now, 30);
  const ins = await db.insert("keranjang_tersimpan", {
    id,
    label: data.label.trim(),
    pelanggan_id: data.pelanggan_id || null,
    pelanggan_nama_snapshot: data.pelanggan_nama_snapshot || null,
    pelanggan_kota: data.pelanggan_kota || null,
    prioritas: data.prioritas,
    ppn_snapshot: data.ppn_snapshot ?? null,
    cart_snapshot: data.cart_snapshot,
    status: "AKTIF",
    kedaluwarsa_pada: kedaluwarsa,
    dibuat_oleh: kasirId || null,
    dibuat_pada: now,
    diperbarui_pada: now,
  });
  if (ins.error) throw friendlyPgError(ins.error, "keranjang_tersimpan");
  return (await loadParkedCart(id))!;
}

export async function listParkedCarts(): Promise<ParkedCart[]> {
  const result = await db.query<ParkedCart>("keranjang_tersimpan", {
    orderBy: { column: "dibuat_pada", ascending: false },
    limit: 100,
  });
  if (result.error) throw friendlyPgError(result.error, "keranjang_tersimpan");
  const now = getCurrentTimestamp();
  return (result.data || [])
    .filter((r) => Number(r.is_deleted) !== 1)
    .filter((r) => r.status === "AKTIF" || r.status === "KEDALUWARSA")
    .map((r) =>
      r.status === "AKTIF" && new Date(r.kedaluwarsa_pada) < new Date(now)
        ? { ...r, status: "KEDALUWARSA" as const }
        : r
    );
}

export async function loadParkedCart(id: string): Promise<ParkedCart | null> {
  const result = await db.queryOne<ParkedCart>("keranjang_tersimpan", { where: { id } });
  if (result.error) throw friendlyPgError(result.error, "keranjang_tersimpan");
  if (!result.data || Number(result.data.is_deleted) === 1) return null;
  return result.data;
}

export async function deleteParkedCart(id: string): Promise<void> {
  const upd = await db.update("keranjang_tersimpan", id, {
    is_deleted: 1,
    deleted_at: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
}

export async function markFinal(id: string): Promise<void> {
  const upd = await db.update("keranjang_tersimpan", id, {
    status: "FINAL",
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
}

export async function jadikanPenawaran(
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
    dibuatOleh: string;
  }
): Promise<{ penawaran_id: string; nomor_penawaran: string }> {
  const created = await createQuotation({
    pelanggan_id: meta.pelanggan_id || null,
    pelanggan_nama_snapshot: meta.pelanggan_nama_snapshot || null,
    pelanggan_kota: meta.pelanggan_kota || null,
    items,
    kena_ppn: meta.kena_ppn,
    ppn_persen: meta.ppn_persen,
    ppn_metode: meta.ppn_metode,
    catatan: meta.catatan || null,
    dibuat_oleh: meta.dibuatOleh,
  });
  const upd = await db.update("keranjang_tersimpan", id, {
    status: "JADIKAN_PENAWARAN",
    penawaran_id: created.id,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "keranjang_tersimpan");
  return { penawaran_id: created.id, nomor_penawaran: created.nomor_penawaran };
}
