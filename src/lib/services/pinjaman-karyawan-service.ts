/**
 * Service pinjaman karyawan (kasbon sebagai PIUTANG, bukan biaya).
 *
 * Koreksi akuntansi utama dari sistem lama: kasbon tidak lagi dicatat sebagai
 * BIAYA (mengurangi laba). Ia diperlakukan sebagai piutang ke karyawan —
 * netral terhadap laba, hanya kas/saldo yang bergerak.
 *
 * Ledger `pinjaman_karyawan` adalah sumber kebenaran saldo:
 *   saldo = Σ(TARIK) − Σ(POTONG_GAJI) − Σ(BAYAR_TUNAI)
 *
 * Setiap mutasi kas mengalir ke `keuangan` kategori PINJAMAN_KARYAWAN dengan
 * token `[REF:pinjaman-<id>]` di `keperluan` agar revert konsisten:
 *   - TARIK       → kredit (kas keluar saat karyawan ambil kasbon).
 *   - BAYAR_TUNAI → debit  (kas masuk saat karyawan kembalikan tunai).
 *   - POTONG_GAJI → TIDAK menyentuh kas (dipotong dari gaji oleh penggajian-service;
 *                   service ini hanya menghitungnya dalam saldo).
 */

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import { isDateInClosedPeriod } from "@/lib/services/accounting-periods-service";
import { friendlyPgError } from "@/lib/pg-error";

/** Satu baris ledger pinjaman karyawan. */
export interface PinjamanKaryawan {
  id: string;
  actor_id: string;
  tanggal: string;
  jumlah: number;
  jenis: "TARIK" | "POTONG_GAJI" | "BAYAR_TUNAI";
  keterangan: string | null;
  keuangan_ref_id: string | null;
  proses_gaji_id: string | null;
  dibuat_oleh: string | null;
  dibuat_pada?: string;
  is_deleted?: number;
}

/** Token referensi yang dipakai void/revert untuk menemukan baris keuangan. */
function refToken(pinjamanId: string): string {
  return `[REF:pinjaman-${pinjamanId}]`;
}

/** Ambil urutan_tampilan berikutnya untuk baris keuangan baru. */
async function nextKeuanganOrder(): Promise<number> {
  const maxOrderResult = await db.query<{ urutan_tampilan: number }>("keuangan", {
    select: "urutan_tampilan",
    orderBy: { column: "urutan_tampilan", ascending: false },
    limit: 1,
  });
  return (maxOrderResult.data?.[0]?.urutan_tampilan || 0) + 1;
}

/**
 * Hitung saldo pinjaman berjalan seorang karyawan.
 * Inilah angka "Sisa Kasbon" yang dulu ditulis manual di buku kas.
 */
export async function hitungSaldoPinjaman(actorId: string): Promise<number> {
  const result = await db.query<PinjamanKaryawan>("pinjaman_karyawan", {
    where: { actor_id: actorId },
  });
  const rows = (result.data || []).filter((r) => Number(r.is_deleted ?? 0) === 0);
  let saldo = 0;
  for (const r of rows) {
    const jumlah = Number(r.jumlah) || 0;
    if (r.jenis === "TARIK") saldo += jumlah;
    else saldo -= jumlah; // POTONG_GAJI + BAYAR_TUNAI menurunkan saldo
  }
  return saldo;
}

/** Daftar ledger pinjaman; bila actorId diisi, hanya karyawan itu. */
export async function listPinjaman(
  actorId?: string
): Promise<PinjamanKaryawan[]> {
  const result = await db.query<PinjamanKaryawan>("pinjaman_karyawan", {
    where: actorId ? { actor_id: actorId } : undefined,
    orderBy: { column: "tanggal", ascending: false },
  });
  return (result.data || []).filter((r) => Number(r.is_deleted ?? 0) === 0);
}

export interface CatatPinjamanInput {
  actorId: string;
  jumlah: number;
  tanggal: string;
  keterangan?: string;
  dibuatOleh?: string;
}

/**
 * Catat karyawan menarik kasbon: baris ledger TARIK + posting keuangan
 * PINJAMAN_KARYAWAN kredit (kas keluar) ber-[REF]. Menaikkan saldo pinjaman.
 */
export async function catatTarikPinjaman(
  input: CatatPinjamanInput
): Promise<PinjamanKaryawan> {
  if (await isDateInClosedPeriod(input.tanggal)) {
    throw new Error(
      `Tanggal ${input.tanggal} berada di periode akuntansi yang sudah ditutup. Buka periode itu dulu.`
    );
  }
  if (!(Number(input.jumlah) > 0)) {
    throw new Error("Jumlah tarikan kasbon harus lebih dari 0.");
  }

  try {
    const hasil = await db.transaction(async () => {
      const pinjamanId = generateId();
      const now = getCurrentTimestamp();
      const keterangan = input.keterangan?.trim() || "Tarik kasbon";

      const pinjamanRow: PinjamanKaryawan = {
        id: pinjamanId,
        actor_id: input.actorId,
        tanggal: input.tanggal,
        jumlah: Number(input.jumlah),
        jenis: "TARIK",
        keterangan,
        keuangan_ref_id: null,
        proses_gaji_id: null,
        dibuat_oleh: input.dibuatOleh || null,
      };
      const insertRes = await db.insert("pinjaman_karyawan", pinjamanRow);
      if (insertRes.error) throw insertRes.error;

      // Posting keuangan: kredit (kas keluar), netral terhadap laba.
      const keuanganId = generateId();
      const keuRes = await db.insert("keuangan", {
        id: keuanganId,
        tanggal: input.tanggal,
        kategori_transaksi: "PINJAMAN_KARYAWAN",
        debit: 0,
        kredit: Number(input.jumlah),
        keperluan: `${keterangan} ${refToken(pinjamanId)}`,
        catatan: null,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: await nextKeuanganOrder(),
        reference_type: "PINJAMAN_KARYAWAN",
        reference_id: pinjamanId,
        dibuat_pada: now,
        diperbarui_pada: now,
      });
      if (keuRes.error) throw keuRes.error;

      // Tautkan balik baris keuangan ke pinjaman.
      const updRes = await db.update("pinjaman_karyawan", pinjamanId, {
        keuangan_ref_id: keuanganId,
      });
      if (updRes.error) throw updRes.error;

      return { ...pinjamanRow, keuangan_ref_id: keuanganId };
    });

    await recalculateCashbookIfAvailable();
    return hasil;
  } catch (e) {
    throw new Error(friendlyPgError(e, "pinjaman_karyawan"));
  }
}

/**
 * Catat karyawan mengembalikan kasbon tunai: baris ledger BAYAR_TUNAI +
 * posting keuangan PINJAMAN_KARYAWAN debit (kas masuk) ber-[REF].
 * Menurunkan saldo pinjaman.
 */
export async function bayarPinjamanTunai(
  input: CatatPinjamanInput
): Promise<PinjamanKaryawan> {
  if (await isDateInClosedPeriod(input.tanggal)) {
    throw new Error(
      `Tanggal ${input.tanggal} berada di periode akuntansi yang sudah ditutup. Buka periode itu dulu.`
    );
  }
  if (!(Number(input.jumlah) > 0)) {
    throw new Error("Jumlah pembayaran kasbon harus lebih dari 0.");
  }

  try {
    const hasil = await db.transaction(async () => {
      const pinjamanId = generateId();
      const now = getCurrentTimestamp();
      const keterangan = input.keterangan?.trim() || "Kembalikan kasbon tunai";

      const pinjamanRow: PinjamanKaryawan = {
        id: pinjamanId,
        actor_id: input.actorId,
        tanggal: input.tanggal,
        jumlah: Number(input.jumlah),
        jenis: "BAYAR_TUNAI",
        keterangan,
        keuangan_ref_id: null,
        proses_gaji_id: null,
        dibuat_oleh: input.dibuatOleh || null,
      };
      const insertRes = await db.insert("pinjaman_karyawan", pinjamanRow);
      if (insertRes.error) throw insertRes.error;

      // Posting keuangan: debit (kas masuk).
      const keuanganId = generateId();
      const keuRes = await db.insert("keuangan", {
        id: keuanganId,
        tanggal: input.tanggal,
        kategori_transaksi: "PINJAMAN_KARYAWAN",
        debit: Number(input.jumlah),
        kredit: 0,
        keperluan: `${keterangan} ${refToken(pinjamanId)}`,
        catatan: null,
        dibuat_oleh: input.dibuatOleh || null,
        urutan_tampilan: await nextKeuanganOrder(),
        reference_type: "PINJAMAN_KARYAWAN",
        reference_id: pinjamanId,
        dibuat_pada: now,
        diperbarui_pada: now,
      });
      if (keuRes.error) throw keuRes.error;

      const updRes = await db.update("pinjaman_karyawan", pinjamanId, {
        keuangan_ref_id: keuanganId,
      });
      if (updRes.error) throw updRes.error;

      return { ...pinjamanRow, keuangan_ref_id: keuanganId };
    });

    await recalculateCashbookIfAvailable();
    return hasil;
  } catch (e) {
    throw new Error(friendlyPgError(e, "pinjaman_karyawan"));
  }
}

/**
 * Batalkan satu baris pinjaman (TARIK / BAYAR_TUNAI): hapus baris keuangan
 * ber-[REF] dan tandai pinjaman is_deleted. Baris POTONG_GAJI dibatalkan lewat
 * pembatalan proses gaji, bukan di sini.
 */
export async function revertPinjaman(pinjamanId: string): Promise<void> {
  try {
    await db.transaction(async () => {
      const existing = await db.queryOne<PinjamanKaryawan>("pinjaman_karyawan", {
        where: { id: pinjamanId },
      });
      if (!existing.data) {
        throw new Error("Baris pinjaman tidak ditemukan.");
      }
      if (existing.data.jenis === "POTONG_GAJI") {
        throw new Error(
          "Potongan gaji hanya bisa dibatalkan lewat pembatalan proses gaji."
        );
      }

      // Hapus semua baris keuangan ber-[REF:pinjaman-<id>].
      const token = refToken(pinjamanId);
      const keuangan = await db.query<{ id: string; keperluan: string }>(
        "keuangan",
        { where: { reference_id: pinjamanId } }
      );
      for (const row of keuangan.data || []) {
        if (String(row.keperluan || "").includes(token)) {
          await db.delete("keuangan", row.id);
        }
      }

      const now = getCurrentTimestamp();
      const updRes = await db.update("pinjaman_karyawan", pinjamanId, {
        is_deleted: 1,
        deleted_at: now,
      });
      if (updRes.error) throw updRes.error;
    });

    await recalculateCashbookIfAvailable();
  } catch (e) {
    throw new Error(friendlyPgError(e, "pinjaman_karyawan"));
  }
}
