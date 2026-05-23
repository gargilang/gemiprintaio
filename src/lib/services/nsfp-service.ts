import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import type { NsfpPool } from "@/types/database";

/**
 * NSFP pool service — kelola Nomor Seri Faktur Pajak yang dialokasikan dari
 * Coretax DJP.
 *
 * Alur typical:
 *   1. User dapat range NSFP dari Coretax (mis. 25.00000001 - 25.00000100).
 *   2. User upload range itu via importNsfpRange().
 *   3. Saat user terbitkan faktur penjualan kena PPN, app pick NSFP TERSEDIA
 *      pertama dengan claimNextAvailable() dan tandai TERPAKAI saat sale
 *      di-create. Kalau sale void, NSFP tetap TERPAKAI (tidak boleh re-use).
 */
export async function importNsfpRange(input: {
  tahun: string;
  kode_transaksi?: string;
  nomor_awal: number;
  nomor_akhir: number;
  catatan?: string | null;
}): Promise<{ inserted: number; skipped: number }> {
  const tahun = String(input.tahun).padStart(2, "0").slice(-2);
  const kodeTransaksi = input.kode_transaksi || "01";

  if (!Number.isInteger(input.nomor_awal) || !Number.isInteger(input.nomor_akhir)) {
    throw new Error("Nomor seri NSFP harus berupa angka bulat");
  }
  if (input.nomor_awal <= 0 || input.nomor_akhir < input.nomor_awal) {
    throw new Error("Range NSFP tidak valid");
  }
  // Sanity check: 1000 sekali import. Range besar harus dipecah.
  if (input.nomor_akhir - input.nomor_awal + 1 > 1000) {
    throw new Error("Maksimum 1.000 NSFP per import. Pecah jadi beberapa batch.");
  }

  let inserted = 0;
  let skipped = 0;
  for (let n = input.nomor_awal; n <= input.nomor_akhir; n++) {
    const seri = String(n).padStart(8, "0");
    const exists = await db.queryOne<NsfpPool>("nsfp_pool", {
      where: { tahun, kode_transaksi: kodeTransaksi, nomor_seri: seri },
    });
    if (exists.data) {
      skipped++;
      continue;
    }
    const ins = await db.insert("nsfp_pool", {
      id: generateId(),
      tahun,
      kode_transaksi: kodeTransaksi,
      nomor_seri: seri,
      status: "TERSEDIA",
      catatan: input.catatan?.trim() || null,
      dibuat_pada: getCurrentTimestamp(),
      diperbarui_pada: getCurrentTimestamp(),
    });
    if (ins.error) throw ins.error;
    inserted++;
  }

  return { inserted, skipped };
}

/**
 * Ambil NSFP yang TERSEDIA paling kecil (urut nomor_seri ASC). Tidak lock
 * row di sini — RPC create_sale_with_inventory yang mengubah status jadi
 * TERPAKAI atomically pada saat penjualan dibuat.
 */
export async function getNextAvailableNsfp(
  tahun?: string,
  kodeTransaksi?: string
): Promise<NsfpPool | null> {
  const where: Record<string, string> = { status: "TERSEDIA" };
  if (tahun) where.tahun = tahun;
  if (kodeTransaksi) where.kode_transaksi = kodeTransaksi;

  const result = await db.query<NsfpPool>("nsfp_pool", {
    where,
    orderBy: { column: "nomor_seri", ascending: true },
    limit: 1,
  });
  if (result.error) throw result.error;
  return (result.data || [])[0] ?? null;
}

export async function listNsfpPool(filters: {
  status?: NsfpPool["status"];
  tahun?: string;
  limit?: number;
} = {}): Promise<NsfpPool[]> {
  const where: Record<string, string> = {};
  if (filters.status) where.status = filters.status;
  if (filters.tahun) where.tahun = filters.tahun;

  const result = await db.query<NsfpPool>("nsfp_pool", {
    where,
    orderBy: { column: "nomor_seri", ascending: true },
    limit: filters.limit ?? 500,
  });
  if (result.error) throw result.error;
  return result.data || [];
}

export async function cancelNsfp(id: string, alasan: string): Promise<void> {
  if (!alasan?.trim()) {
    throw new Error("Alasan pembatalan NSFP wajib diisi");
  }
  const upd = await db.update("nsfp_pool", id, {
    status: "BATAL",
    catatan: alasan.trim(),
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
}
