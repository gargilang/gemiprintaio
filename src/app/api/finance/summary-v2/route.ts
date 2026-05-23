/**
 * /api/finance/summary-v2 — semantic summary feed for the new Keuangan UI bars.
 *
 * Returns:
 *   formulasByGroup: every active formula bucketed into summary / profit_share /
 *                    cash_advance / bonus / custom (drives which bar shows what)
 *   actors:          active business_actors with their role_group
 *   summaryByKey:    { formula_key: latest_value } for the requested month
 *
 * The legacy /api/finance/config endpoint remains in place during the
 * migration window; finance/page.tsx can pull from both.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  disableLegacyOrphanActorFormulas,
  getActorFinanceSummary,
  syncAllActiveActorFormulas,
} from "@/lib/services/formula-service";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";
import { seedDefaultsIfEmpty, listFormulas } from "@/lib/services/cashbook-formula-service";
import { listBusinessActors } from "@/lib/services/business-actor-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") || undefined;

    // Old seed formulas without Kelola Orang link are disabled automatically.
    await disableLegacyOrphanActorFormulas();

    // Idempotent system formula seed — re-inserts missing defaults (Omzet,
    // Biaya, Saldo, Laba Bersih, Modal Kas, Piutang Kas, Kas) without
    // touching existing rows. When new formulas are added, recalc populates
    // their values in transaction_computed so the cards show real numbers.
    const seeded = await seedDefaultsIfEmpty();
    if (seeded.formulasInserted > 0) {
      // Only recalc when fresh formulas were added — otherwise values are
      // already up-to-date from the last create/update/delete cascade.
      await recalculateCashbookIfAvailable();
    }

    // Recovery: if any active actor has no linked formulas (e.g. after a
    // "Kembalikan ke bawaan" wipe), re-sync their formulas automatically.
    const [actors, formulas] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listFormulas(),
    ]);
    const actorIdsWithFormulas = new Set(
      formulas.filter((f) => f.actorId).map((f) => f.actorId as string)
    );
    const orphanActorIds = actors
      .filter((a) => !actorIdsWithFormulas.has(a.id))
      .map((a) => a.id);
    if (orphanActorIds.length > 0) {
      await syncAllActiveActorFormulas(orphanActorIds);
      await recalculateCashbookIfAvailable();
    }

    const latestMap = await getLatestPerFormulaKey(month);
    const summary = await getActorFinanceSummary(latestMap);

    // Surface key system metrics so the page can render summary cards
    // without computing them client-side. The values come from the
    // latest computed row in the requested month.
    const systemMetrics = {
      omzet: latestMap.omzet ?? 0,
      biaya_operasional: latestMap.biaya_operasional ?? 0,
      biaya_bahan: latestMap.biaya_bahan ?? 0,
      saldo: latestMap.saldo ?? 0,
      laba_bersih: latestMap.laba_bersih ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      piutang_kas: latestMap.piutang_kas ?? 0,
      kas: latestMap.kas ?? 0,
    };

    return NextResponse.json({
      month: month ?? null,
      columns: summary.columns,
      rows: summary.rows,
      systemMetrics,
      legacyOrphanFormulas: 0,
    });
  } catch (error) {
    console.error("GET /api/finance/summary-v2 error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan keuangan v2" },
      { status: 500 }
    );
  }
}
