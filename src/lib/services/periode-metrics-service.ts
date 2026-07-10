/**
 * Hitung metrik keuangan (Omzet, Biaya, Laba) langsung dari tabel keuangan
 * untuk satu periode tertentu.
 *
 * BERBEDA dari transaksi_terhitung (running total kumulatif): fungsi ini
 * mengembalikan total INKREMENTAL untuk periode yang dipilih, sehingga
 * nilai reset ke 0 setelah tutup periode.
 *
 * Logika berdasarkan formula AST di src/lib/ast/defaults.ts:
 *   Omzet        : debit  bila kategori OMZET / PIUTANG;
 *                  -kredit bila RETUR_PENJUALAN / RETUR_PENJUALAN_NONCASH.
 *   Biaya Ops    : kredit bila kategori BIAYA / TABUNGAN / GAJI.
 *   Biaya Bahan  : kredit bila HPP; -debit bila RETUR_HPP.
 *   Laba Bersih  : Omzet − (Biaya Ops + Biaya Bahan).
 *   Saldo        : TIDAK dihitung di sini — tetap dari running total global.
 */

import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

export interface PeriodMetrics {
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
}

const ZERO_METRICS: PeriodMetrics = {
  omzet: 0,
  biaya_operasional: 0,
  biaya_bahan: 0,
  laba_bersih: 0,
};

/** Kategori yang berkontribusi ke omzet (positif = debit, negatif = kredit). */
const KATEGORI_OMZET_POSITIF = new Set(["OMZET", "PIUTANG"]);
const KATEGORI_OMZET_NEGATIF = new Set([
  "RETUR_PENJUALAN",
  "RETUR_PENJUALAN_NONCASH",
]);

/** Kategori yang berkontribusi ke biaya operasional (kredit). */
const KATEGORI_BIAYA_OPS = new Set(["BIAYA", "TABUNGAN", "GAJI"]);

/**
 * Agregasi metrik periode dari baris keuangan mentah (kategori + debit/kredit).
 * Diekspor supaya laporan (reports-service) memakai logika kategori yang sama
 * persis — satu sumber kebenaran, bebas dari asumsi kontiguitas running total.
 */
export function aggregatePeriodMetricsFromRows(
  rows: Array<{ kategori_transaksi: string; debit: number; kredit: number }>,
): PeriodMetrics {
  let omzet = 0;
  let biaya_operasional = 0;
  let biaya_bahan = 0;

  for (const row of rows) {
    const kat = row.kategori_transaksi;
    const debit = Number(row.debit) || 0;
    const kredit = Number(row.kredit) || 0;

    if (KATEGORI_OMZET_POSITIF.has(kat)) {
      omzet += debit;
    } else if (KATEGORI_OMZET_NEGATIF.has(kat)) {
      omzet -= kredit;
    } else if (KATEGORI_BIAYA_OPS.has(kat)) {
      biaya_operasional += kredit;
    } else if (kat === "HPP") {
      biaya_bahan += kredit;
    } else if (kat === "RETUR_HPP") {
      biaya_bahan -= debit;
    }
  }

  return {
    omzet,
    biaya_operasional,
    biaya_bahan,
    laba_bersih: omzet - biaya_operasional - biaya_bahan,
  };
}

/**
 * Hitung metrik Omzet, Biaya Operasional, Biaya Bahan, dan Laba Bersih
 * untuk satu periode — tanpa ikutsertakan running total dari periode sebelumnya.
 */
export async function computePeriodMetrics(
  periodeId: string,
): Promise<PeriodMetrics> {
  try {
    const sb = getServerSupabaseClient();

    if (sb) {
      const { data, error } = await sb
        .from("keuangan")
        .select("kategori_transaksi, debit, kredit")
        .eq("periode_id", periodeId)
        .or("status_transaksi.is.null,status_transaksi.neq.VOIDED");

      if (error) {
        console.warn("[computePeriodMetrics] Supabase error:", error.message);
        return ZERO_METRICS;
      }

      return aggregatePeriodMetricsFromRows(
        (data ?? []) as Array<{
          kategori_transaksi: string;
          debit: number;
          kredit: number;
        }>,
      );
    }

    // SQLite path: gunakan db.query (kompatibel dengan mock-db di test).
    const result = await db.query<{
      kategori_transaksi: string;
      debit: number;
      kredit: number;
      status_transaksi?: string;
    }>("keuangan", {
      where: { periode_id: periodeId },
    });

    const rows = (result.data ?? []).filter(
      (r) => r.status_transaksi !== "VOIDED",
    );

    return aggregatePeriodMetricsFromRows(rows);
  } catch (err) {
    console.warn("[computePeriodMetrics] Error:", err);
    return ZERO_METRICS;
  }
}
