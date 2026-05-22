import { NextRequest, NextResponse } from "next/server";
import {
  deleteFormula,
  listFormulas,
  resetFormulasToDefaults,
  upsertFormula,
} from "@/lib/services/cashbook-formula-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import { validateAST } from "@/lib/ast/validate";
import { listPartners } from "@/lib/services/cashbook-formula-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const formulas = await listFormulas();
    return NextResponse.json({ formulas });
  } catch (error) {
    console.error("GET /api/cashbook-formula error:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar rumus" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "upsert");

    if (action === "reset") {
      await resetFormulasToDefaults();
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body?.id || "");
      if (!id) {
        return NextResponse.json(
          { error: "ID rumus wajib diisi" },
          { status: 400 }
        );
      }
      await deleteFormula(id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    // Default: upsert.
    const formula = body?.formula ?? body;
    if (!formula?.column || !formula?.dbColumn || !formula?.name) {
      return NextResponse.json(
        { error: "Nama, kolom hasil, dan kolom DB wajib diisi" },
        { status: 400 }
      );
    }

    const partners = await listPartners();
    const partnerIds = partners.map((p) => p.id);
    const issues = validateAST(formula.ast, [], partnerIds);
    if (issues.length > 0) {
      return NextResponse.json(
        { error: issues[0].message, issues },
        { status: 422 }
      );
    }

    const saved = await upsertFormula({
      id: formula.id,
      name: String(formula.name),
      column: String(formula.column),
      dbColumn: String(formula.dbColumn),
      formulaKey: formula.formulaKey ?? undefined,
      actorId: formula.actorId ?? null,
      formulaGroup: formula.formulaGroup ?? "custom",
      isVisibleInSummary:
        typeof formula.isVisibleInSummary === "boolean"
          ? formula.isVisibleInSummary
          : undefined,
      ast: formula.ast,
      enabled: formula.enabled !== false,
      isSystem: Boolean(formula.isSystem),
      displayOrder: Number(formula.displayOrder ?? 0),
      description: formula.description ?? null,
    });

    await recalculateCashbookIfAvailable();
    return NextResponse.json({ ok: true, formula: saved });
  } catch (error) {
    console.error("POST /api/cashbook-formula error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Gagal menyimpan rumus" },
      { status: 500 }
    );
  }
}
