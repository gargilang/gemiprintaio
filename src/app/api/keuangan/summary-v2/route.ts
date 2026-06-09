/**
 * /api/finance/summary-v2 — semantic summary feed for the new Keuangan UI bars.
 *
 * Returns:
 *   formulasByGroup: every active formula bucketed into summary / profit_share /
 *                    cash_advance / bonus / custom (drives which bar shows what)
 *   actors:          active pegawai with their role_group
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
import {
  seedDefaultsIfEmpty,
  listFormulasRaw,
} from "@/lib/services/cashbook-formula-service";
import {
  listBusinessActors,
  listActorRoles,
} from "@/lib/services/business-actor-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") || undefined;

    // 1. Seed system formulas once. Only writes when rows are actually missing.
    const seeded = await seedDefaultsIfEmpty();
    if (seeded.formulasInserted > 0) {
      // Only recalc when fresh formulas were added — otherwise values are
      // already up-to-date from the last create/update/delete cascade.
      await recalculateCashbookIfAvailable();
    }

    // 2. Fetch actors, roles, formulas and latest computed values in parallel.
    //    listFormulasRaw skips the redundant seedDefaultsIfEmpty call inside
    //    listFormulas() since we already seeded above.
    const [actors, roles, formulas, latestMap] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
      listFormulasRaw(),
      getLatestPerFormulaKey(month),
    ]);

    // 3. Disable legacy orphan actor formulas (no actor_id) using the
    //    already-fetched formula list — no extra DB read.
    await disableLegacyOrphanActorFormulas(formulas);

    // 4. Recovery: if any active actor has no linked formulas (e.g. after a
    //    "Kembalikan ke bawaan" wipe), re-sync their formulas automatically.
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

    // 5. Build summary, passing pre-fetched data to avoid redundant DB calls
    //    inside getActorFinanceSummary.
    const summary = await getActorFinanceSummary(latestMap, {
      actors,
      roles,
      formulas,
    });

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
