import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  createFinanceCategory,
  createFinanceMetricMapping,
  deleteFinanceCategory,
  deleteFinanceMetricMapping,
  updateFinanceMetricMapping,
  updateColumnRule,
  updateCategoryContributions,
} from "@/lib/services/finance-config-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "create_category") {
      const result = await createFinanceCategory({
        category_code: body.category_code,
        display_name: body.display_name,
      });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_category") {
      const result = await deleteFinanceCategory(body.id);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "create_mapping") {
      const result = await createFinanceMetricMapping({
        metric_key: body.metric_key,
        metric_label: body.metric_label,
        metric_group: body.metric_group,
        source_column: body.source_column,
        participant_id: body.participant_id || null,
      });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "update_mapping") {
      const result = await updateFinanceMetricMapping(body.id, {
        metric_label: body.metric_label,
        metric_group: body.metric_group,
        source_column: body.source_column,
        participant_id: body.participant_id || null,
      });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_mapping") {
      const result = await deleteFinanceMetricMapping(body.id);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

    if (action === "update_column_rule") {
      const result = await updateColumnRule(body.id, {
        display_name: body.display_name,
        formula_expression: body.formula_expression ?? null,
        kasbon_conditions: body.kasbon_conditions ?? null,
        rule_type: body.rule_type,
      });
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "update_category_contributions") {
      const result = await updateCategoryContributions(
        body.category_id,
        body.contributions ?? []
      );
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/finance/config/manage error:", error);
    const message =
      error instanceof Error ? error.message : "Gagal memproses perubahan konfigurasi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
