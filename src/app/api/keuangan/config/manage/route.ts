import { NextRequest, NextResponse } from "next/server";
import {
  createFinanceCategory,
  createFinanceMetricMapping,
  createFinanceParticipant,
  deleteFinanceCategory,
  deleteFinanceMetricMapping,
  deleteFinanceParticipant,
  removeBagiHasilPartner,
  setupBagiHasilPartner,
  updateBagiHasilPercents,
  updateFinanceMetricMapping,
  updateProfitShareParticipant,
  updateColumnRule,
  updateCategoryContributions,
} from "@/lib/services/finance-config-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import type { ProfitFormula } from "@/lib/profit-share-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "create_participant") {
      const result = await createFinanceParticipant({
        participant_code: body.participant_code,
        display_name: body.display_name,
        role_type: body.role_type || "other",
      });
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_participant") {
      const result = await deleteFinanceParticipant(body.id);
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }

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

    if (action === "setup_bagi_hasil_partner") {
      const result = await setupBagiHasilPartner({
        display_name: body.display_name,
        participant_role: body.participant_role,
        profit_formula: body.profit_formula as ProfitFormula | undefined,
        share_divisor: body.share_divisor,
        source_column: body.source_column,
      });
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true, data: result.data });
    }

    if (action === "update_bagi_hasil_percents") {
      const percents = Array.isArray(body.percents) ? body.percents : [];
      const result = await updateBagiHasilPercents(percents);
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "update_profit_share_partner") {
      const result = await updateProfitShareParticipant(body.id, {
        profit_formula: body.profit_formula as ProfitFormula,
        share_divisor: Number(body.share_divisor) || 3,
      });
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "remove_bagi_hasil_partner") {
      const result = await removeBagiHasilPartner(body.participant_id);
      if (result.error) throw result.error;
      await recalculateCashbookIfAvailable();
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
    console.error("POST /api/finance/config/manage error:", error);
    const message =
      error instanceof Error ? error.message : "Gagal memproses perubahan konfigurasi";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
