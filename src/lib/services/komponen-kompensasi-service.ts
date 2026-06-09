/**
 * Service komponen kompensasi.
 *
 * Komponen kompensasi adalah definisi berulang yang membentuk gaji seorang
 * karyawan. Tiap karyawan bisa punya beberapa komponen:
 *   - GAJI_POKOK / TUNJANGAN / KOMISI / BONUS (tipe)
 *   - metode TETAP  → nominal tetap per periode.
 *   - metode PERSEN → persen × nilai sumber (mis. 5% dari `omzet` periode).
 *
 * `hitungBrutoPeriode` dipakai penggajian-service untuk menghitung gaji bruto satu
 * karyawan dalam satu periode. Nilai sumber (omzet/laba/dll.) dipasok caller
 * dari ringkasan keuangan periode itu — service ini tidak query buku kas.
 */

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { friendlyPgError } from "@/lib/pg-error";

export type TipeKomponen = "GAJI_POKOK" | "TUNJANGAN" | "KOMISI" | "BONUS";
export type MetodeKomponen = "TETAP" | "PERSEN";

export interface KomponenKompensasi {
  id: string;
  actor_id: string;
  tipe: TipeKomponen;
  nama: string;
  metode: MetodeKomponen;
  nominal: number;
  persen: number;
  sumber_formula_key: string | null;
  aktif_status: number;
  urutan_tampilan: number;
  catatan: string | null;
  is_deleted?: number;
  dibuat_pada?: string;
}

export interface KomponenInput {
  actor_id: string;
  tipe: TipeKomponen;
  nama: string;
  metode: MetodeKomponen;
  nominal?: number;
  persen?: number;
  sumber_formula_key?: string | null;
  aktif_status?: number;
  urutan_tampilan?: number;
  catatan?: string | null;
}

/** Validasi konsistensi metode ↔ field wajib. */
function validateKomponen(input: {
  metode: MetodeKomponen;
  nominal?: number;
  persen?: number;
  sumber_formula_key?: string | null;
}): void {
  if (input.metode === "TETAP") {
    if (!(Number(input.nominal) > 0)) {
      throw new Error("Komponen metode TETAP wajib mengisi nominal lebih dari 0.");
    }
  } else if (input.metode === "PERSEN") {
    if (!(Number(input.persen) > 0)) {
      throw new Error("Komponen metode PERSEN wajib mengisi persen lebih dari 0.");
    }
    if (!input.sumber_formula_key) {
      throw new Error(
        "Komponen metode PERSEN wajib memilih sumber (mis. omzet atau laba)."
      );
    }
  }
}

/** Daftar komponen aktif (non-terhapus) milik satu karyawan. */
export async function listKomponen(
  actorId: string
): Promise<KomponenKompensasi[]> {
  const result = await db.query<KomponenKompensasi>("komponen_kompensasi", {
    where: { actor_id: actorId },
    orderBy: { column: "urutan_tampilan", ascending: true },
  });
  return (result.data || []).filter((r) => Number(r.is_deleted ?? 0) === 0);
}

/** Buat komponen baru setelah validasi. */
export async function createKomponen(
  input: KomponenInput
): Promise<KomponenKompensasi> {
  validateKomponen(input);
  try {
    const id = generateId();
    const now = getCurrentTimestamp();
    const row = {
      id,
      actor_id: input.actor_id,
      tipe: input.tipe,
      nama: input.nama.trim(),
      metode: input.metode,
      nominal: input.metode === "TETAP" ? Number(input.nominal) : 0,
      persen: input.metode === "PERSEN" ? Number(input.persen) : 0,
      sumber_formula_key:
        input.metode === "PERSEN" ? input.sumber_formula_key || null : null,
      aktif_status: input.aktif_status ?? 1,
      urutan_tampilan: input.urutan_tampilan ?? 0,
      catatan: input.catatan?.trim() || null,
      dibuat_pada: now,
      diperbarui_pada: now,
    };
    const res = await db.insert("komponen_kompensasi", row);
    if (res.error) throw res.error;
    return row as KomponenKompensasi;
  } catch (e) {
    throw new Error(friendlyPgError(e, "komponen_kompensasi"));
  }
}

/** Perbarui sebagian field komponen. Memvalidasi ulang bila metode/field berubah. */
export async function updateKomponen(
  id: string,
  patch: Partial<KomponenInput>
): Promise<void> {
  try {
    const existing = await db.queryOne<KomponenKompensasi>("komponen_kompensasi", {
      where: { id },
    });
    if (!existing.data) throw new Error("Komponen tidak ditemukan.");

    const merged = {
      metode: (patch.metode ?? existing.data.metode) as MetodeKomponen,
      nominal: patch.nominal ?? existing.data.nominal,
      persen: patch.persen ?? existing.data.persen,
      sumber_formula_key:
        patch.sumber_formula_key ?? existing.data.sumber_formula_key,
    };
    validateKomponen(merged);

    const cleanPatch: Record<string, unknown> = { ...patch };
    if (typeof cleanPatch.nama === "string") {
      cleanPatch.nama = (cleanPatch.nama as string).trim();
    }
    const res = await db.update("komponen_kompensasi", id, cleanPatch);
    if (res.error) throw res.error;
  } catch (e) {
    throw new Error(friendlyPgError(e, "komponen_kompensasi"));
  }
}

/** Hapus komponen secara soft (is_deleted = 1). */
export async function deleteKomponen(id: string): Promise<void> {
  try {
    const res = await db.update("komponen_kompensasi", id, {
      is_deleted: 1,
      deleted_at: getCurrentTimestamp(),
      aktif_status: 0,
    });
    if (res.error) throw res.error;
  } catch (e) {
    throw new Error(friendlyPgError(e, "komponen_kompensasi"));
  }
}

export interface RincianKomponen {
  komponen_id: string;
  tipe: TipeKomponen;
  nama: string;
  metode: MetodeKomponen;
  nilai: number;
}

export interface HasilBruto {
  bruto: number;
  rincian: RincianKomponen[];
}

/**
 * Hitung gaji bruto satu karyawan untuk satu periode.
 * `sumberNilai` memetakan formula_key → nilai (mis. { omzet: 20000000 }),
 * dipasok caller dari ringkasan keuangan periode. Komponen PERSEN yang
 * merujuk sumber yang tidak ada dihitung 0.
 */
export async function hitungBrutoPeriode(
  actorId: string,
  sumberNilai: Record<string, number>
): Promise<HasilBruto> {
  const komponen = await listKomponen(actorId);
  const aktif = komponen.filter((k) => Number(k.aktif_status ?? 1) === 1);

  const rincian: RincianKomponen[] = [];
  let bruto = 0;
  for (const k of aktif) {
    let nilai = 0;
    if (k.metode === "TETAP") {
      nilai = Number(k.nominal) || 0;
    } else {
      const sumber = k.sumber_formula_key
        ? Number(sumberNilai[k.sumber_formula_key]) || 0
        : 0;
      nilai = (Number(k.persen) || 0) / 100 * sumber;
    }
    bruto += nilai;
    rincian.push({
      komponen_id: k.id,
      tipe: k.tipe,
      nama: k.nama,
      metode: k.metode,
      nilai,
    });
  }
  return { bruto, rincian };
}
