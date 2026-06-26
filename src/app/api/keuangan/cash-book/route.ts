import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { db, getServerSupabaseClient } from "@/lib/db-unified";
import {
  createCashBookEntry,
  canDeleteCashBookEntry,
  ensureLatestCashbookMetricsFresh,
} from "@/lib/services/finance-service";
import { listBusinessActors, listActorRoles } from "@/lib/services/business-actor-service";
import { buildRingkasanPengurusCepat } from "@/lib/finance-summary-cache";
import { fetchKeuanganCashBookByPeriod } from "@/lib/server-data-supabase";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";

export async function GET() {
  try {
    const { getOrCreateOpenPeriod, formatPeriodLabel } = await import(
      "@/lib/services/accounting-periods-service"
    );
    const { computePeriodMetrics } = await import(
      "@/lib/services/periode-metrics-service"
    );

    // Dapatkan periode aktif (OPEN). Bila tidak ada, buat otomatis.
    const currentPeriod = await getOrCreateOpenPeriod();
    const periodeLabel = formatPeriodLabel(currentPeriod.period_key);

    if (getServerSupabaseClient()) {
      await ensureLatestCashbookMetricsFresh();
      const [cashBooks, latestMap, periodMetrics, actors, roles] = await Promise.all([
        fetchKeuanganCashBookByPeriod(currentPeriod.id),
        getLatestPerFormulaKey(), // saldo, modal_kas, saldo_kasbon, kas tetap global
        computePeriodMetrics(currentPeriod.id),
        listBusinessActors({ includeInactive: false }),
        listActorRoles(),
      ]);

      const systemMetrics = {
        // Metrik periode: reset setiap tutup periode
        omzet: periodMetrics.omzet,
        biaya_operasional: periodMetrics.biaya_operasional,
        biaya_bahan: periodMetrics.biaya_bahan,
        laba_bersih: periodMetrics.laba_bersih,
        // Metrik global: tidak reset (kas fisik tidak hilang saat tutup buku)
        saldo: latestMap.saldo ?? 0,
        modal_kas: latestMap.modal_kas ?? 0,
        saldo_kasbon: latestMap.saldo_kasbon ?? 0,
        kas: latestMap.kas ?? 0,
      };

      const cashBooksWithDeletable = cashBooks.map(
        (row: Record<string, unknown>) => ({
          ...row,
          dapat_dihapus: canDeleteCashBookEntry({
            reference_type: (row.reference_type as string) ?? null,
            keperluan: (row.keperluan as string) ?? null,
          }),
        }),
      );

      return NextResponse.json({
        cashBooks: cashBooksWithDeletable,
        systemMetrics,
        actorSummarySeed: buildRingkasanPengurusCepat({
          actors,
          roles,
          latestSystemMetrics: systemMetrics,
        }),
        periodeLabel,
        periodeId: currentPeriod.id,
        activePeriod: {
          startDate: currentPeriod.start_date,
          endDate: currentPeriod.end_date,
        },
      });
    }

    // SQLite fallback
    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan
         WHERE periode_id = ?
           AND COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'
         ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
        [currentPeriod.id],
      )) || [];

    const [latestMap, periodMetrics, actors, roles] = await Promise.all([
      getLatestPerFormulaKey(),
      computePeriodMetrics(currentPeriod.id),
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
    ]);

    const systemMetrics = {
      omzet: periodMetrics.omzet,
      biaya_operasional: periodMetrics.biaya_operasional,
      biaya_bahan: periodMetrics.biaya_bahan,
      laba_bersih: periodMetrics.laba_bersih,
      saldo: latestMap.saldo ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
      kas: latestMap.kas ?? 0,
    };

    const cashBooksWithDeletable = (cashBooks as Record<string, unknown>[]).map(
      (row) => ({
        ...row,
        dapat_dihapus: canDeleteCashBookEntry({
          reference_type: (row.reference_type as string) ?? null,
          keperluan: (row.keperluan as string) ?? null,
        }),
      }),
    );

    return NextResponse.json({
      cashBooks: cashBooksWithDeletable,
      systemMetrics,
      actorSummarySeed: buildRingkasanPengurusCepat({
        actors,
        roles,
        latestSystemMetrics: systemMetrics,
      }),
      periodeLabel,
      periodeId: currentPeriod.id,
      activePeriod: {
        startDate: currentPeriod.start_date,
        endDate: currentPeriod.end_date,
      },
    });
  } catch (error) {
    console.error("GET /api/keuangan/cash-book error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data keuangan" },
      { status: 500 },
    );
  }
}

function isClientValidationMessage(msg: string): boolean {
  return (
    msg.includes("wajib diisi") ||
    msg.includes("Tidak boleh mengisi debit dan kredit") ||
    msg.includes("Debit atau kredit harus diisi")
  );
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const {
      tanggal,
      kategori_transaksi,
      debit = 0,
      kredit = 0,
      keperluan = "",
      catatan = "",
      dibuat_oleh = "",
    } = body;

    const { cashBook } = await createCashBookEntry({
      tanggal,
      kategori_transaksi,
      debit,
      kredit,
      keperluan,
      catatan,
      dibuat_oleh,
    });

    return NextResponse.json(
      { message: "Transaksi berhasil ditambahkan", cashBook },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("POST /api/finance/cash-book error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg && isClientValidationMessage(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Gagal menambahkan transaksi" },
      { status: 500 },
    );
  }
}
