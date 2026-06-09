/**
 * Service proses gaji + slip + pembatalan (inti modul penggajian).
 */

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import { isDateInClosedPeriod } from "@/lib/services/accounting-periods-service";
import { friendlyPgError } from "@/lib/pg-error";
import {
  hitungBrutoPeriode,
  type RincianKomponen,
} from "@/lib/services/komponen-kompensasi-service";
import { hitungSaldoPinjaman } from "@/lib/services/pinjaman-karyawan-service";

export type StatusProsesGaji = "DRAFT" | "DIBAYAR" | "VOIDED";
export type MetodeBayar = "CASH" | "TRANSFER";

/** Satu slip dalam hasil hitung draft (belum tertulis ke DB). */
export interface DraftSlipGaji {
  actor_id: string;
  nama: string;
  bruto: number;
  saldo_pinjaman: number;
  potongan_kasbon: number;
  neto: number;
  rincian: RincianKomponen[];
}

/** Hasil hitung draft gaji satu periode. */
export interface DraftGaji {
  periode: string;
  slips: DraftSlipGaji[];
  total_bruto: number;
  total_potongan_kasbon: number;
  total_neto: number;
}

export interface OpsiDraftGaji {
  /** Nilai sumber untuk komponen PERSEN (mis. { omzet, laba }). */
  sumberNilai?: Record<string, number>;
  /** Potongan kasbon per karyawan yang dipilih owner (default 0). */
  potonganPerActor?: Record<string, number>;
}

interface PegawaiRow {
  id: string;
  display_name: string;
  is_active?: number;
  is_deleted?: number;
}

function refToken(runId: string): string {
  return "[REF:gaji-" + runId + "]";
}

/**
 * Lempar error ramah. Error domain (Error biasa tanpa kode PG) sudah berbahasa
 * Indonesia dan diteruskan apa adanya; hanya error DB (punya `code`) yang
 * diterjemahkan via friendlyPgError agar tidak membocorkan detail constraint.
 */
function lemparRamah(e: unknown, table: string): never {
  const code = (e as { code?: string } | null)?.code;
  if (!code && e instanceof Error) throw e;
  throw new Error(friendlyPgError(e, table));
}

/** urutan_tampilan berikutnya untuk baris keuangan baru. */
async function nextKeuanganOrder(): Promise<number> {
  const maxOrderResult = await db.query<{ urutan_tampilan: number }>("keuangan", {
    select: "urutan_tampilan",
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });
  return (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;
}

/**
 * Hitung draft gaji satu periode (TIDAK menulis DB).
 * Untuk tiap karyawan aktif yang punya komponen: bruto, saldo pinjaman,
 * potongan kasbon = min(pilihan owner, saldo, bruto), neto = bruto − potongan.
 */
export async function hitungDraftGaji(
  periode: string,
  opsi: OpsiDraftGaji = {}
): Promise<DraftGaji> {
  const sumberNilai = opsi.sumberNilai || {};
  const potonganPerActor = opsi.potonganPerActor || {};

  const actorsResult = await db.query<PegawaiRow>("pegawai", {});
  const actors = (actorsResult.data || []).filter(
    (a) => Number(a.is_deleted ?? 0) === 0 && Number(a.is_active ?? 1) === 1
  );

  const slips: DraftSlipGaji[] = [];
  for (const actor of actors) {
    const { bruto, rincian } = await hitungBrutoPeriode(actor.id, sumberNilai);
    // Karyawan tanpa komponen aktif dilewati (bukan penerima gaji).
    if (rincian.length === 0) continue;

    const saldo = await hitungSaldoPinjaman(actor.id);
    const diminta = Number(potonganPerActor[actor.id]) || 0;
    const potongan = Math.max(0, Math.min(diminta, saldo, bruto));
    const neto = bruto - potongan;

    slips.push({
      actor_id: actor.id,
      nama: actor.display_name,
      bruto,
      saldo_pinjaman: saldo,
      potongan_kasbon: potongan,
      neto,
      rincian,
    });
  }

  const total_bruto = slips.reduce((s, x) => s + x.bruto, 0);
  const total_potongan_kasbon = slips.reduce((s, x) => s + x.potongan_kasbon, 0);
  const total_neto = slips.reduce((s, x) => s + x.neto, 0);

  return { periode, slips, total_bruto, total_potongan_kasbon, total_neto };
}

/**
 * Simpan draft ke DB: insert proses_gaji (status DRAFT) + slip_gaji per
 * karyawan. Mengembalikan id run. Tidak menyentuh kas (belum dibayar).
 */
export async function simpanDraftGaji(
  draft: DraftGaji,
  dibuatOleh?: string
): Promise<string> {
  try {
    const runId = await db.transaction(async () => {
      const id = generateId();
      const now = getCurrentTimestamp();
      const runRes = await db.insert("proses_gaji", {
        id,
        periode: draft.periode,
        tanggal_bayar: null,
        status: "DRAFT",
        metode_bayar: "CASH",
        total_bruto: draft.total_bruto,
        total_potongan_kasbon: draft.total_potongan_kasbon,
        total_neto: draft.total_neto,
        catatan: null,
        dibuat_oleh: dibuatOleh || null,
        dibuat_pada: now,
        diperbarui_pada: now,
      });
      if (runRes.error) throw runRes.error;

      for (const slip of draft.slips) {
        const slipRes = await db.insert("slip_gaji", {
          id: generateId(),
          proses_gaji_id: id,
          actor_id: slip.actor_id,
          bruto: slip.bruto,
          potongan_kasbon: slip.potongan_kasbon,
          neto: slip.neto,
          metode_bayar: "CASH",
          keuangan_ref_id: null,
          komponen_snapshot: JSON.stringify(slip.rincian),
          status: "DRAFT",
          catatan: null,
          dibuat_pada: now,
          diperbarui_pada: now,
        });
        if (slipRes.error) throw slipRes.error;
      }
      return id;
    });
    return runId;
  } catch (e) {
    lemparRamah(e, "proses_gaji");
  }
}

interface SlipGajiRow {
  id: string;
  proses_gaji_id: string;
  actor_id: string;
  bruto: number;
  potongan_kasbon: number;
  neto: number;
  keuangan_ref_id: string | null;
  komponen_snapshot?: string | null;
  metode_bayar?: string;
  nama?: string;
  status?: string;
}

/**
 * Bayar proses gaji (DRAFT → DIBAYAR) dalam satu transaksi:
 *   - Guard period-closed pada tanggal bayar.
 *   - Per slip: posting keuangan GAJI kredit = BRUTO (beban penuh, mengurangi
 *     laba) ber-[REF:gaji-<runId>]. Bila ada potongan kasbon, posting keuangan
 *     PINJAMAN_KARYAWAN debit = potongan (kas masuk pengimbang, netral laba)
 *     dan insert baris pinjaman_karyawan POTONG_GAJI (menurunkan saldo pinjaman).
 *   ⇒ net kas keluar = neto; beban gaji tercatat = bruto.
 *   - Set run + slip DIBAYAR, simpan keuangan_ref_id GAJI di slip.
 */
export async function bayarProsesGaji(
  runId: string,
  tanggalBayar: string,
  metodeBayar: MetodeBayar,
  dibuatOleh?: string
): Promise<void> {
  if (await isDateInClosedPeriod(tanggalBayar)) {
    throw new Error(
      "Tanggal " + tanggalBayar + " berada di periode akuntansi yang sudah ditutup. Buka periode itu dulu."
    );
  }

  try {
    await db.transaction(async () => {
      const runRes = await db.queryOne<{ id: string; status: string; periode: string }>(
        "proses_gaji",
        { where: { id: runId } }
      );
      if (!runRes.data) throw new Error("Proses gaji tidak ditemukan.");
      if (runRes.data.status !== "DRAFT") {
        throw new Error("Hanya proses gaji berstatus DRAFT yang bisa dibayar.");
      }

      const slipsRes = await db.query<SlipGajiRow>("slip_gaji", {
        where: { proses_gaji_id: runId },
      });
      const slips = (slipsRes.data || []).filter(
        (s) => (s.status ?? "DRAFT") !== "VOIDED"
      );

      const now = getCurrentTimestamp();
      const token = refToken(runId);

      for (const slip of slips) {
        // 1) Beban gaji penuh (bruto) — kredit, mengurangi laba lewat kategori GAJI.
        const gajiId = generateId();
        const gajiRes = await db.insert("keuangan", {
          id: gajiId,
          tanggal: tanggalBayar,
          kategori_transaksi: "GAJI",
          debit: 0,
          kredit: slip.bruto,
          keperluan: "Gaji " + runRes.data.periode + " " + token,
          catatan: null,
          dibuat_oleh: dibuatOleh || null,
          urutan_tampilan: await nextKeuanganOrder(),
          reference_type: "PAYROLL",
          reference_id: runId,
          dibuat_pada: now,
          diperbarui_pada: now,
        });
        if (gajiRes.error) throw gajiRes.error;

        // 2) Potongan kasbon (bila ada): kas masuk pengimbang + ledger POTONG_GAJI.
        if (slip.potongan_kasbon > 0) {
          const potongKasId = generateId();
          const potongRes = await db.insert("keuangan", {
            id: potongKasId,
            tanggal: tanggalBayar,
            kategori_transaksi: "PINJAMAN_KARYAWAN",
            debit: slip.potongan_kasbon,
            kredit: 0,
            keperluan: "Potong kasbon gaji " + runRes.data.periode + " " + token,
            catatan: null,
            dibuat_oleh: dibuatOleh || null,
            urutan_tampilan: await nextKeuanganOrder(),
            reference_type: "PAYROLL",
            reference_id: runId,
            dibuat_pada: now,
            diperbarui_pada: now,
          });
          if (potongRes.error) throw potongRes.error;

          const ledgerRes = await db.insert("pinjaman_karyawan", {
            id: generateId(),
            actor_id: slip.actor_id,
            tanggal: tanggalBayar,
            jumlah: slip.potongan_kasbon,
            jenis: "POTONG_GAJI",
            keterangan: "Potongan kasbon saat gajian " + runRes.data.periode,
            keuangan_ref_id: potongKasId,
            proses_gaji_id: runId,
            dibuat_oleh: dibuatOleh || null,
            dibuat_pada: now,
            diperbarui_pada: now,
          });
          if (ledgerRes.error) throw ledgerRes.error;
        }

        const slipUpd = await db.update("slip_gaji", slip.id, {
          status: "DIBAYAR",
          metode_bayar: metodeBayar,
          keuangan_ref_id: gajiId,
        });
        if (slipUpd.error) throw slipUpd.error;
      }

      const runUpd = await db.update("proses_gaji", runId, {
        status: "DIBAYAR",
        tanggal_bayar: tanggalBayar,
        metode_bayar: metodeBayar,
      });
      if (runUpd.error) throw runUpd.error;
    });

    await recalculateCashbookIfAvailable();
  } catch (e) {
    lemparRamah(e, "proses_gaji");
  }
}

/**
 * Batalkan proses gaji yang sudah DIBAYAR (DIBAYAR → VOIDED): balik semua.
 *   - Hapus baris keuangan ber-[REF:gaji-<runId>] (GAJI + PINJAMAN_KARYAWAN).
 *   - Tandai baris pinjaman_karyawan POTONG_GAJI run ini is_deleted (saldo balik).
 *   - Set run + slip VOIDED.
 */
export async function batalkanProsesGaji(
  runId: string,
  dibatalkanOleh?: string
): Promise<void> {
  try {
    await db.transaction(async () => {
      const runRes = await db.queryOne<{ id: string; status: string }>(
        "proses_gaji",
        { where: { id: runId } }
      );
      if (!runRes.data) throw new Error("Proses gaji tidak ditemukan.");
      if (runRes.data.status !== "DIBAYAR") {
        throw new Error("Hanya proses gaji berstatus DIBAYAR yang bisa dibatalkan.");
      }

      const token = refToken(runId);

      // 1) Hapus baris keuangan ber-[REF].
      const keuangan = await db.query<{ id: string; keperluan: string }>(
        "keuangan",
        { where: { reference_id: runId } }
      );
      for (const row of keuangan.data || []) {
        if (String(row.keperluan || "").includes(token)) {
          await db.delete("keuangan", row.id);
        }
      }

      const now = getCurrentTimestamp();

      // 2) Balik baris pinjaman POTONG_GAJI milik run ini.
      const potongan = await db.query<{ id: string; jenis: string }>(
        "pinjaman_karyawan",
        { where: { proses_gaji_id: runId } }
      );
      for (const row of potongan.data || []) {
        if (row.jenis === "POTONG_GAJI") {
          await db.update("pinjaman_karyawan", row.id, {
            is_deleted: 1,
            deleted_at: now,
          });
        }
      }

      // 3) Set slip VOIDED.
      const slips = await db.query<{ id: string }>("slip_gaji", {
        where: { proses_gaji_id: runId },
      });
      for (const slip of slips.data || []) {
        await db.update("slip_gaji", slip.id, { status: "VOIDED" });
      }

      // 4) Set run VOIDED.
      const runUpd = await db.update("proses_gaji", runId, {
        status: "VOIDED",
        voided_at: now,
        voided_by: dibatalkanOleh || null,
      });
      if (runUpd.error) throw runUpd.error;
    });

    await recalculateCashbookIfAvailable();
  } catch (e) {
    lemparRamah(e, "proses_gaji");
  }
}

export interface ProsesGajiDetail {
  id: string;
  periode: string;
  tanggal_bayar: string | null;
  status: StatusProsesGaji;
  metode_bayar: MetodeBayar;
  total_bruto: number;
  total_potongan_kasbon: number;
  total_neto: number;
  catatan: string | null;
  dibuat_pada?: string;
  slips: SlipGajiRow[];
}

/**
 * Daftar proses gaji beserta slip-nya (join di memori, hindari N+1).
 * Mengabaikan run yang is_deleted.
 */
export async function daftarProsesGaji(): Promise<ProsesGajiDetail[]> {
  const runsRes = await db.query<ProsesGajiDetail & { is_deleted?: number }>(
    "proses_gaji",
    { orderBy: { column: "dibuat_pada", ascending: false } }
  );
  const runs = (runsRes.data || []).filter(
    (r) => Number(r.is_deleted ?? 0) === 0
  );
  if (runs.length === 0) return [];

  const slipsRes = await db.query<SlipGajiRow & { is_deleted?: number }>(
    "slip_gaji",
    {}
  );
  const allSlips = (slipsRes.data || []).filter(
    (s) => Number(s.is_deleted ?? 0) === 0
  );

  // Join nama karyawan sekali (hindari N+1).
  const actorIds = Array.from(new Set(allSlips.map((s) => s.actor_id)));
  const namaByActor = new Map<string, string>();
  if (actorIds.length > 0) {
    const actorsRes = await db.query<{ id: string; display_name: string }>(
      "pegawai",
      {}
    );
    for (const a of actorsRes.data || []) {
      namaByActor.set(a.id, a.display_name);
    }
  }

  return runs.map((run) => ({
    ...run,
    slips: allSlips
      .filter((s) => s.proses_gaji_id === run.id)
      .map((s) => ({ ...s, nama: namaByActor.get(s.actor_id) || s.actor_id })),
  }));
}


