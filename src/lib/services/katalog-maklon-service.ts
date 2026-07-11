import "server-only";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";
import {
  katalogMaklonInputSchema,
  type KatalogMaklonInput,
} from "@/lib/schemas/katalog-maklon";

export interface KatalogMaklon {
  id: string;
  nama_produk: string;
  nama_satuan: string;
  harga_jual_default: number;
  biaya_subkontrak_default: number;
  vendor_subkontrak_id_default: string | null;
  metode_bayar_vendor_default: "CASH" | "NET30" | "TRANSFER";
  kategori: string | null; // legacy free-text, tetap disimpan
  kategori_id: string | null; // FK ke kategori_barang
  kategori_nama?: string | null; // dari join, untuk POS/modal
  populer_status: number; // 0/1 manual override (C5)
  butuh_dimensi_status: number; // 0/1: harga per m² (lebar × panjang × jumlah)
  catatan_internal: string | null;
  is_aktif: number;
  urutan: number;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}

type KatalogMaklonRow = KatalogMaklon & { is_deleted?: number };

export async function listKatalogMaklon(
  onlyAktif = true,
): Promise<KatalogMaklon[]> {
  const result = await db.query<KatalogMaklonRow>("katalog_maklon", {
    // Populer (C5) tampil lebih dulu, lalu urutan bawaan.
    orderBy: { column: "populer_status", ascending: false },
  });
  if (result.error) throw friendlyPgError(result.error, "katalog_maklon");
  const rows = (result.data || []).filter(
    (r) =>
      Number(r.is_deleted) !== 1 && (!onlyAktif || Number(r.is_aktif) === 1),
  );
  // Join kategori_nama di memory (N+1 kecil; tabel kategori_barang bounded).
  // db-unified mendukung filter IN via bentuk array pada `where`.
  const kategoriIds = [
    ...new Set(rows.map((r) => r.kategori_id).filter(Boolean) as string[]),
  ];
  const kategoriMap = new Map<string, string>();
  if (kategoriIds.length) {
    const katRes = await db.query<{ id: string; nama: string }>(
      "kategori_barang",
      { where: { id: kategoriIds } },
    );
    for (const k of katRes.data || []) kategoriMap.set(k.id, k.nama);
  }
  return rows.map((r) => ({
    ...r,
    kategori_nama: r.kategori_id
      ? (kategoriMap.get(r.kategori_id) ?? null)
      : null,
  }));
}

async function assertNamaUnik(nama_produk: string, exceptId?: string) {
  const all = await listKatalogMaklon(false);
  const clash = all.find(
    (r) =>
      r.nama_produk.toLowerCase() === nama_produk.toLowerCase() &&
      r.id !== exceptId,
  );
  if (clash)
    throw new Error(`Nama produk "${nama_produk}" sudah ada di katalog maklon`);
}

export async function createKatalogMaklon(
  input: KatalogMaklonInput,
  dibuatOleh: string,
): Promise<KatalogMaklon> {
  const parsed = katalogMaklonInputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  await assertNamaUnik(data.nama_produk);
  const id = generateId();
  const now = getCurrentTimestamp();
  const ins = await db.insert("katalog_maklon", {
    id,
    nama_produk: data.nama_produk.trim(),
    nama_satuan: data.nama_satuan,
    harga_jual_default: data.harga_jual_default,
    biaya_subkontrak_default: data.biaya_subkontrak_default,
    vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null,
    metode_bayar_vendor_default: data.metode_bayar_vendor_default,
    kategori: data.kategori || null,
    kategori_id: data.kategori_id || null,
    populer_status: data.populer_status,
    butuh_dimensi_status: data.butuh_dimensi_status,
    catatan_internal: data.catatan_internal || null,
    is_aktif: data.is_aktif,
    urutan: data.urutan,
    dibuat_oleh: dibuatOleh || null,
    dibuat_pada: now,
    diperbarui_pada: now,
  });
  if (ins.error) throw friendlyPgError(ins.error, "katalog_maklon");
  return {
    id,
    ...data,
    vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null,
    dibuat_oleh: dibuatOleh || null,
    dibuat_pada: now,
    diperbarui_pada: now,
  } as KatalogMaklon;
}

export async function updateKatalogMaklon(
  id: string,
  input: KatalogMaklonInput,
): Promise<void> {
  const parsed = katalogMaklonInputSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const data = parsed.data;
  await assertNamaUnik(data.nama_produk, id);
  const upd = await db.update("katalog_maklon", id, {
    nama_produk: data.nama_produk.trim(),
    nama_satuan: data.nama_satuan,
    harga_jual_default: data.harga_jual_default,
    biaya_subkontrak_default: data.biaya_subkontrak_default,
    vendor_subkontrak_id_default: data.vendor_subkontrak_id_default || null,
    metode_bayar_vendor_default: data.metode_bayar_vendor_default,
    kategori: data.kategori || null,
    kategori_id: data.kategori_id || null,
    populer_status: data.populer_status,
    butuh_dimensi_status: data.butuh_dimensi_status,
    catatan_internal: data.catatan_internal || null,
    is_aktif: data.is_aktif,
    urutan: data.urutan,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "katalog_maklon");
}

export async function deleteKatalogMaklon(id: string): Promise<void> {
  const upd = await db.update("katalog_maklon", id, {
    is_deleted: 1,
    deleted_at: getCurrentTimestamp(),
  });
  if (upd.error) throw friendlyPgError(upd.error, "katalog_maklon");
}
