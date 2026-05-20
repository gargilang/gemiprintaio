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
  countLegacyOrphanActorFormulas,
  getActorFinanceSummaryRows,
} from "@/lib/services/formula-service";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") || undefined;

    const latestMap = await getLatestPerFormulaKey(month);
    const [actorRows, legacyOrphanFormulas] = await Promise.all([
      getActorFinanceSummaryRows(latestMap),
      countLegacyOrphanActorFormulas(),
    ]);

    return NextResponse.json({
      month: month ?? null,
      actorRows,
      /** Rumus lama (tanpa actor_id) masih aktif di cashbook_formula — bukan dari Kelola Orang */
      legacyOrphanFormulas,
    });
  } catch (error) {
    console.error("GET /api/finance/summary-v2 error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan keuangan v2" },
      { status: 500 }
    );
  }
}
