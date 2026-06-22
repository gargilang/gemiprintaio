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
  updateBusinessActor,
  deactivateBusinessActor,
  reactivateBusinessActor,
  deleteBusinessActor,
  getBusinessActor,
  listActorRoles,
} from "@/lib/services/business-actor-service";
import { syncFormulasForActor } from "@/lib/services/formula-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";
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
  potongBagiHasil,
  batalkanPotongBagiHasil,
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
import { potongBagiHasilSchema } from "@/lib/schemas/penggajian";

// ── Ringkasan halaman (karyawan + komponen + saldo pinjaman) ────────────────
export interface RingkasanKaryawan {
  actor_id: string;
  nama: string;
  role_code: string;
  role_label: string;
  role_group: string;
  jumlah_komponen: number;
  tipe_komponen: string[];
  saldo_pinjaman: number;
  profit_share_percent: number | null;
  is_active: number;
}

/**
 * Muat ringkasan untuk halaman utama: tiap karyawan aktif beserta jumlah
 * komponen kompensasi aktif, tipe-tipe komponennya, dan saldo pinjaman.
 * Join di memori untuk menghindari N+1.
 */
export async function listRingkasanKaryawanAction(
  includeInactive = false,
): Promise<RingkasanKaryawan[]> {
  try {
    const [actors, roles] = await Promise.all([
      listBusinessActors({ includeInactive }),
      listActorRoles(),
    ]);
    const groupByCode = new Map(roles.map((r) => [r.role_code, r.role_group]));
    const labelByCode = new Map(roles.map((r) => [r.role_code, r.role_label]));
    const hasil: RingkasanKaryawan[] = [];
    for (const a of actors) {
      const komponen = await listKomponen(a.id);
      const aktif = komponen.filter((k) => Number(k.aktif_status ?? 1) === 1);
      const saldo = await hitungSaldoPinjaman(a.id);
      hasil.push({
        actor_id: a.id,
        nama: a.display_name,
        role_code: a.role_code,
        role_label: labelByCode.get(a.role_code) ?? a.role_code,
        role_group: groupByCode.get(a.role_code) ?? "other",
        jumlah_komponen: aktif.length,
        tipe_komponen: Array.from(new Set(aktif.map((k) => k.tipe))),
        saldo_pinjaman: saldo,
        profit_share_percent: a.profit_share_percent,
        is_active: a.is_active,
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

// ── Metrik kas buku besar (Kas, Modal Kas, Saldo Kasbon) untuk kartu ringkasan ─
// Diambil dari AST engine (transaksi_terhitung) — sumber kebenaran kolom buku
// kas. Saldo Kasbon di sini = kolom AST saldo_kasbon (kategori PINJAMAN_KARYAWAN),
// identik dengan total saldo ledger pinjaman_karyawan.
export async function getMetrikKasAction(): Promise<{
  kas: number;
  modal_kas: number;
  saldo_kasbon: number;
}> {
  try {
    const latestMap = await getLatestPerFormulaKey();
    return {
      kas: latestMap.kas ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
    };
  } catch (error) {
    console.error("getMetrikKasAction error:", error);
    return { kas: 0, modal_kas: 0, saldo_kasbon: 0 };
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

// ── Pengurus yang belum punya komponen gaji (kandidat untuk juga digaji) ──────
// Dipakai modal Tambah Karyawan agar orang lama (mis. manager penerima bagi
// hasil) bisa langsung diberi komponen gaji tanpa membuat data orang baru.
export async function listPengurusBelumDigajiAction(): Promise<
  { actor_id: string; nama: string; role_code: string }[]
> {
  try {
    const actors = await listBusinessActors({ includeInactive: false });
    const hasil: { actor_id: string; nama: string; role_code: string }[] = [];
    for (const a of actors) {
      // Hanya pengurus (punya bagi hasil) yang BELUM punya komponen gaji aktif.
      if (a.profit_share_percent === null) continue;
      const komponen = await listKomponen(a.id);
      const adaKomponen = komponen.some(
        (k) => Number(k.aktif_status ?? 1) === 1,
      );
      if (adaKomponen) continue;
      hasil.push({
        actor_id: a.id,
        nama: a.display_name,
        role_code: a.role_code,
      });
    }
    return hasil;
  } catch (error) {
    console.error("listPengurusBelumDigajiAction error:", error);
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
    return {
      success: true,
      actor_id: created.data.id,
      nama: created.data.display_name,
    };
  } catch (error) {
    console.error("tambahKaryawanAction error:", error);
    throw error;
  }
}

// ── Bagi hasil per orang (sumber kebenaran: pegawai.profit_share_percent) ─────
// Bagi hasil bisa diatur dari modal Karyawan maupun tab Pengurus; keduanya
// menulis ke kolom yang sama agar tidak ada duplikasi orang.

/** Info bagi hasil satu orang + sisa jatah yang masih tersedia (hard cap 100%). */
export async function getInfoBagiHasilAction(actorId: string): Promise<{
  persen: number | null;
  sisa: number;
}> {
  try {
    const actors = await listBusinessActors({ includeInactive: false });
    const self = actors.find((a) => a.id === actorId) ?? null;
    // Sisa = 100 − Σ(bagi hasil orang aktif LAIN). Jatah orang ini sendiri
    // tidak dihitung agar field-nya bisa menampilkan nilai saat ini + ruang sisa.
    const terpakaiLain = actors
      .filter((a) => a.id !== actorId)
      .reduce((sum, a) => sum + (a.profit_share_percent ?? 0), 0);
    return {
      persen: self?.profit_share_percent ?? null,
      sisa: Math.max(0, 100 - terpakaiLain),
    };
  } catch (error) {
    console.error("getInfoBagiHasilAction error:", error);
    return { persen: null, sisa: 100 };
  }
}

/** Set/ubah bagi hasil seseorang dengan hard cap 100%. persen=null menghapus bagi hasil. */
export async function setBagiHasilAction(
  actorId: string,
  persen: number | null,
): Promise<{ success: true }> {
  try {
    await requireAdminOrManager();
    if (persen !== null) {
      const actors = await listBusinessActors({ includeInactive: false });
      const terpakaiLain = actors
        .filter((a) => a.id !== actorId)
        .reduce((sum, a) => sum + (a.profit_share_percent ?? 0), 0);
      const sisa = Math.max(0, 100 - terpakaiLain);
      if (persen > sisa) {
        throw new Error(
          `Bagi hasil ${persen}% melebihi sisa jatah ${sisa}%. Total semua orang maksimal 100%.`,
        );
      }
    }
    const res = await updateBusinessActor(actorId, {
      profit_share_percent: persen,
    });
    if (res.error) throw new Error(res.error.message);
    // Sinkron rumus bagi hasil + recalc buku kas supaya Ringkasan Pengurus ikut.
    await syncFormulasForActor(actorId);
    await recalculateCashbookIfAvailable();
    return { success: true };
  } catch (error) {
    console.error("setBagiHasilAction error:", error);
    throw error;
  }
}

// ── Nonaktif / Aktif / Hapus karyawan ────────────────────────────────────────
export async function nonaktifkanKaryawanAction(actorId: string) {
  try {
    await requireAdminOrManager();
    const res = await deactivateBusinessActor(actorId);
    if (res.error) throw new Error(res.error.message);
    await syncFormulasForActor(actorId);
    await recalculateCashbookIfAvailable();
    return { success: true };
  } catch (error) {
    console.error("nonaktifkanKaryawanAction error:", error);
    throw error;
  }
}

export async function aktifkanKaryawanAction(actorId: string) {
  try {
    await requireAdminOrManager();
    const res = await reactivateBusinessActor(actorId);
    if (res.error) throw new Error(res.error.message);
    await syncFormulasForActor(actorId);
    await recalculateCashbookIfAvailable();
    return { success: true };
  } catch (error) {
    console.error("aktifkanKaryawanAction error:", error);
    throw error;
  }
}

export async function hapusKaryawanAction(actorId: string) {
  try {
    await requireAdminOrManager();
    // Cegah hapus bila masih ada komponen gaji atau saldo kasbon berjalan.
    const komponen = await listKomponen(actorId);
    if (komponen.some((k) => Number(k.aktif_status ?? 1) === 1)) {
      throw new Error(
        "Tidak bisa dihapus: karyawan masih punya komponen gaji aktif. Hapus komponennya dulu atau nonaktifkan saja.",
      );
    }
    const saldo = await hitungSaldoPinjaman(actorId);
    if (saldo !== 0) {
      throw new Error(
        "Tidak bisa dihapus: karyawan masih punya saldo kasbon berjalan. Lunasi dulu atau nonaktifkan saja.",
      );
    }
    const orang = await getBusinessActor(actorId);
    const res = await deleteBusinessActor(actorId);
    if (res.error) throw new Error(res.error.message);
    await recalculateCashbookIfAvailable();
    return { success: true, nama: orang?.display_name ?? "" };
  } catch (error) {
    console.error("hapusKaryawanAction error:", error);
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

export async function simpanKomponenAction(
  input: KomponenInput & { id?: string },
) {
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

export async function hitungDraftGajiAction(
  periode: string,
  opsi: OpsiDraftGaji = {},
) {
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
  metodeBayar: MetodeBayar,
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

// ── Potong Bagi Hasil ────────────────────────────────────────────────────────
export async function potongBagiHasilAction(input: {
  actorId: string;
  jumlah: number;
  tanggal: string;
  periode: string;
  keterangan?: string;
}): Promise<void> {
  const session = await requireAdminOrManager();
  const parsed = potongBagiHasilSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Data potong bagi hasil tidak valid.");
  }
  await potongBagiHasil({ ...parsed.data, dibuatOleh: session.uid });
}

export async function batalkanPotongBagiHasilAction(
  pinjamanId: string,
): Promise<void> {
  await requireAdminOrManager();
  await batalkanPotongBagiHasil(pinjamanId);
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
