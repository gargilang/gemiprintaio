import { NextRequest, NextResponse } from "next/server";
import { evaluateDataset } from "@/lib/ast/evaluator";
import {
  listActiveFormulas,
  listFormulas,
  listPartners,
} from "@/lib/services/cashbook-formula-service";
import type { InputRow } from "@/lib/ast/types";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/evaluate
 *
 * Body:
 *   {
 *     rows: Array<{ C: string; D: number; E: number; F: string }>,
 *     formulas?: FormulaDefinition[]    // optional override
 *     partners?: PartnerDefinition[]    // optional override
 *     activeOnly?: boolean              // default true
 *   }
 *
 * Response:
 *   {
 *     outputs: Array<Record<string, number | string | boolean>>,
 *     formulas: FormulaDefinition[],
 *     partners: PartnerDefinition[]
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const rows = (body?.rows ?? []) as InputRow[];

    if (!Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Field `rows` harus berupa array" },
        { status: 400 }
      );
    }

    const formulas =
      Array.isArray(body?.formulas) && body.formulas.length > 0
        ? body.formulas
        : body?.activeOnly === false
          ? await listFormulas()
          : await listActiveFormulas();
    const partners =
      Array.isArray(body?.partners) && body.partners.length > 0
        ? body.partners
        : await listPartners();

    const sanitizedRows: InputRow[] = rows.map((r) => ({
      C: String(r?.C ?? ""),
      D: Number(r?.D ?? 0) || 0,
      E: Number(r?.E ?? 0) || 0,
      F: String(r?.F ?? ""),
    }));

    const outputs = evaluateDataset(
      sanitizedRows,
      formulas.map((f: { column: string; ast: unknown }) => ({
        column: f.column,
        ast: f.ast as never,
      })),
      partners
    );

    return NextResponse.json({ outputs, formulas, partners });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/evaluate error:", error);
    return NextResponse.json(
      {
        error: (error as Error).message || "Gagal mengevaluasi rumus",
      },
      { status: 500 }
    );
  }
}
