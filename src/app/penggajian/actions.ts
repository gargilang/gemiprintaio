"use server";

/**
 * Server Actions modul Penggajian.
 *
 * Wrapper tipis di atas service. Aksi mutasi dibungkus guard requireAdminOrManager
 * (penggajian sensitif) dan meneruskan session.uid sebagai dibuat_oleh — identitas
 * tidak pernah diambil dari klien. Aksi baca boleh ungated.
 */

import { requireAdminOrManager } from "@/lib/auth-guard-server";
import {
  listBusinessActors,
  createBusinessActor,
  listActorRoles,
} from "@/lib/services/business-actor-service";
import { getShopSettings } from "@/lib/services/shop-settings-service";
import {
  listKomponen,
  createKomponen,
  updateKomponen,
  deleteKomponen,
  type KomponenInput,
} from "@/lib/services/komponen-kompensasi-service";
import {
  listPinjaman,
  hitungSaldoPinjaman,
  catatTarikPinjaman,
  bayarPinjamanTunai,
  revertPinjaman,
} from "@/lib/services/pinjaman-karyawan-service";
import {
  daftarProsesGaji,
  hitungDraftGaji,
  simpanDraftGaji,
  bayarProsesGaji,
  batalkanProsesGaji,
  type DraftGaji,
  type OpsiDraftGaji,
  type MetodeBayar,
} from "@/lib/services/penggajian-service";

// ── Ringkasan halaman (karyawan + komponen + saldo pinjaman) ────────────────
export interface RingkasanKaryawan {
  actor_id: string;
  nama: string;
  role_code: string;
  jumlah_komponen: number;
  tipe_komponen: string[];
  saldo_pinjaman: number;
}

/**
 * Muat ringkasan untuk halaman utama: tiap karyawan aktif beserta jumlah
 * komponen kompensasi aktif, tipe-tipe komponennya, dan saldo pinjaman.
 * Join di memori untuk menghindari N+1.
 */
export async function listRingkasanKaryawanAction(): Promise<RingkasanKaryawan[]> {
  try {
    const actors = await listBusinessActors({ includeInactive: false });
    const hasil: RingkasanKaryawan[] = [];
    for (const a of actors) {
      const komponen = await listKomponen(a.id);
      const aktif = komponen.filter((k) => Number(k.aktif_status ?? 1) === 1);
      const saldo = await hitungSaldoPinjaman(a.id);
      hasil.push({
        actor_id: a.id,
        nama: a.display_name,
        role_code: a.role_code,
        jumlah_komponen: aktif.length,
        tipe_komponen: Array.from(new Set(aktif.map((k) => k.tipe))),
        saldo_pinjaman: saldo,
      });
    }
    return hasil;
  } catch (error) {
    console.error("listRingkasanKaryawanAction error:", error);
    throw error;
  }
}

// ── Karyawan (baca) ──────────────────────────────────────────────────────────
export async function listKaryawanAction() {
  try {
    return await listBusinessActors({ includeInactive: false });
  } catch (error) {
    console.error("listKaryawanAction error:", error);
    throw error;
  }
}

// ── Peran untuk dropdown Tambah Karyawan (sembunyikan grup owner) ────────────
export async function listPeranKaryawanAction() {
  try {
    const roles = await listActorRoles();
    return roles.filter((r) => r.role_group !== "owner");
  } catch (error) {
    console.error("listPeranKaryawanAction error:", error);
    throw error;
  }
}

// ── Tambah karyawan baru (tanpa bagi hasil) ─────────────────────────────────
export async function tambahKaryawanAction(input: {
  display_name: string;
  role_code: string;
  notes?: string;
}) {
  try {
    await requireAdminOrManager();
    const created = await createBusinessActor({
      display_name: input.display_name,
      role_code: input.role_code,
      notes: input.notes ?? null,
      profit_share_percent: null,
      cash_advance_categories: null,
      keperluan_keyword: null,
      bonus_percent: null,
      bonus_source_formula_key: null,
    });
    if (created.error || !created.data) {
      throw new Error(created.error?.message || "Gagal menambah karyawan");
    }
    return { success: true, actor_id: created.data.id, nama: created.data.display_name };
  } catch (error) {
    console.error("tambahKaryawanAction error:", error);
    throw error;
  }
}

// ── Komponen kompensasi ──────────────────────────────────────────────────────
export async function listKomponenAction(actorId: string) {
  try {
    return await listKomponen(actorId);
  } catch (error) {
    console.error("listKomponenAction error:", error);
    throw error;
  }
}

export async function simpanKomponenAction(input: KomponenInput & { id?: string }) {
  try {
    await requireAdminOrManager();
    if (input.id) {
      const { id, ...patch } = input;
      await updateKomponen(id, patch);
      return { success: true, id };
    }
    const komponen = await createKomponen(input);
    return { success: true, id: komponen.id };
  } catch (error) {
    console.error("simpanKomponenAction error:", error);
    throw error;
  }
}

export async function hapusKomponenAction(id: string) {
  try {
    await requireAdminOrManager();
    await deleteKomponen(id);
    return { success: true };
  } catch (error) {
    console.error("hapusKomponenAction error:", error);
    throw error;
  }
}

// ── Pinjaman karyawan (kasbon) ───────────────────────────────────────────────
export async function listPinjamanAction(actorId?: string) {
  try {
    const pinjaman = await listPinjaman(actorId);
    const saldo = actorId ? await hitungSaldoPinjaman(actorId) : null;
    return { pinjaman, saldo };
  } catch (error) {
    console.error("listPinjamanAction error:", error);
    throw error;
  }
}

export async function catatTarikPinjamanAction(input: {
  actorId: string;
  jumlah: number;
  tanggal: string;
  keterangan?: string;
}) {
  try {
    const s = await requireAdminOrManager();
    const pinjaman = await catatTarikPinjaman({ ...input, dibuatOleh: s.uid });
    return { success: true, id: pinjaman.id };
  } catch (error) {
    console.error("catatTarikPinjamanAction error:", error);
    throw error;
  }
}

export async function bayarPinjamanTunaiAction(input: {
  actorId: string;
  jumlah: number;
  tanggal: string;
  keterangan?: string;
}) {
  try {
    const s = await requireAdminOrManager();
    const pinjaman = await bayarPinjamanTunai({ ...input, dibuatOleh: s.uid });
    return { success: true, id: pinjaman.id };
  } catch (error) {
    console.error("bayarPinjamanTunaiAction error:", error);
    throw error;
  }
}

export async function revertPinjamanAction(id: string) {
  try {
    await requireAdminOrManager();
    await revertPinjaman(id);
    return { success: true };
  } catch (error) {
    console.error("revertPinjamanAction error:", error);
    throw error;
  }
}

// ── Proses gaji ──────────────────────────────────────────────────────────────
export async function daftarProsesGajiAction() {
  try {
    return await daftarProsesGaji();
  } catch (error) {
    console.error("daftarProsesGajiAction error:", error);
    throw error;
  }
}

export async function hitungDraftGajiAction(periode: string, opsi: OpsiDraftGaji = {}) {
  try {
    await requireAdminOrManager();
    return await hitungDraftGaji(periode, opsi);
  } catch (error) {
    console.error("hitungDraftGajiAction error:", error);
    throw error;
  }
}

export async function simpanDraftGajiAction(draft: DraftGaji) {
  try {
    const s = await requireAdminOrManager();
    const runId = await simpanDraftGaji(draft, s.uid);
    return { success: true, run_id: runId };
  } catch (error) {
    console.error("simpanDraftGajiAction error:", error);
    throw error;
  }
}

export async function bayarProsesGajiAction(
  runId: string,
  tanggalBayar: string,
  metodeBayar: MetodeBayar
) {
  try {
    const s = await requireAdminOrManager();
    await bayarProsesGaji(runId, tanggalBayar, metodeBayar, s.uid);
    return { success: true };
  } catch (error) {
    console.error("bayarProsesGajiAction error:", error);
    throw error;
  }
}

export async function batalkanProsesGajiAction(runId: string) {
  try {
    const s = await requireAdminOrManager();
    await batalkanProsesGaji(runId, s.uid);
    return { success: true };
  } catch (error) {
    console.error("batalkanProsesGajiAction error:", error);
    throw error;
  }
}

/** Nama toko untuk kop slip gaji. */
export async function getNamaTokoAction(): Promise<string> {
  try {
    const s = await getShopSettings();
    return s.nama_toko || "gemiprint";
  } catch (error) {
    console.error("getNamaTokoAction error:", error);
    return "gemiprint";
  }
}
