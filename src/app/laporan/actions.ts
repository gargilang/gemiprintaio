"use server";

/**
 * Server Actions untuk halaman Laporan.
 */

import { getFormalAccountingReport } from "@/lib/services/reports-service";
import {
  getLaporanBulananData,
  generateNomorLaporan,
  simpanLaporanBulanan,
  type LaporanBulananData,
} from "@/lib/services/laporan-bulanan-service";
import { listAccountingPeriods } from "@/lib/services/accounting-periods-service";
import { generateLaporanBulananHTML } from "@/lib/laporan-bulanan-print";
import { embedGemiprintFontsInHtml } from "@/lib/print-fonts-server";
import { generateLaporanBulananSchema } from "@/lib/schemas/laporan";
import { requireAdminOrManager } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { db } from "@/lib/db-unified";
import { randomUUID } from "crypto";

export async function getFormalAccountingReportAction(data: {
  startDate: string;
  endDate: string;
  periodeId?: string;
}) {
  try {
    return await getFormalAccountingReport(data);
  } catch (error) {
    console.error("Error in getFormalAccountingReportAction:", error);
    throw error;
  }
}

/** Daftar periode akuntansi CLOSED untuk dropdown modal. */
export async function getClosedAccountingPeriodsAction(): Promise<
  Array<{
    id: string;
    period_key: string;
    start_date: string;
    end_date: string;
  }>
> {
  try {
    await requireAdminOrManager();
    const periods = await listAccountingPeriods();
    return periods
      .filter((p) => p.status === "CLOSED")
      .map(({ id, period_key, start_date, end_date }) => ({
        id,
        period_key,
        start_date,
        end_date,
      }));
  } catch (err) {
    if (err instanceof AuthGuardError) throw err;
    console.error("getClosedAccountingPeriodsAction error:", err);
    throw err;
  }
}

/** Generate HTML laporan bulanan; simpan riwayat hanya bila simpan_riwayat true. */
export async function generateLaporanBulananAction(
  rawParams: unknown,
): Promise<string> {
  try {
    const session = await requireAdminOrManager();

    const parsed = generateLaporanBulananSchema.safeParse(rawParams);
    if (!parsed.success) {
      throw new Error("Data laporan tidak valid.");
    }
    const params = parsed.data;

    const periodRes = await db.queryOne<{ period_key: string; status: string }>(
      "accounting_periods",
      { where: { id: params.accounting_period_id } },
    );
    if (periodRes.error) throw periodRes.error;
    if (!periodRes.data) throw new Error("Periode tidak ditemukan.");
    if (periodRes.data.status !== "CLOSED") {
      throw new Error("Hanya periode yang sudah ditutup yang bisa dicetak.");
    }

    const nomorLaporan = await generateNomorLaporan(periodRes.data.period_key);

    const laporanData: LaporanBulananData = await getLaporanBulananData({
      accounting_period_id: params.accounting_period_id,
      nomor_laporan: nomorLaporan,
      kata_pembuka: params.kata_pembuka,
      kata_penutup: params.kata_penutup,
    });

    if (params.simpan_riwayat) {
      await simpanLaporanBulanan({
        id: randomUUID(),
        nomor_laporan: nomorLaporan,
        accounting_period_id: params.accounting_period_id,
        dibuat_oleh: session.uid,
        kata_pembuka: params.kata_pembuka,
        kata_penutup: params.kata_penutup,
      });
    }

    return embedGemiprintFontsInHtml(generateLaporanBulananHTML(laporanData));
  } catch (err) {
    if (err instanceof AuthGuardError) throw err;
    console.error("generateLaporanBulananAction error:", err);
    throw err;
  }
}
