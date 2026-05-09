import { NextRequest, NextResponse } from "next/server";
import {
  createFinanceCategory,
  createFinanceMetricMapping,
  createFinanceParticipant,
  deleteFinanceCategory,
  deleteFinanceMetricMapping,
  deleteFinanceParticipant,
  updateFinanceMetricMapping,
} from "@/lib/services/finance-config-service";

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

    return NextResponse.json({ error: "Action tidak dikenali" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/finance/config/manage error:", error);
    return NextResponse.json(
      { error: "Gagal memproses perubahan konfigurasi" },
      { status: 500 }
    );
  }
}
