/**
 * /api/business-actors — CRUD for the v2 people table.
 *
 * GET             list active actors (?include_inactive=1 to include archived)
 * POST            create OR update OR deactivate OR delete depending on `action`
 *
 * Creating / updating an actor auto-syncs the matching cashbook_formula
 * (kasbon / bagi hasil / bonus) and triggers a cashbook recalc so the new
 * bar lights up immediately.
 */

import { NextRequest, NextResponse } from "next/server";

import {
  createBusinessActor,
  deactivateBusinessActor,
  deleteBusinessActor,
  listActorRoles,
  listBusinessActors,
  reactivateBusinessActor,
  updateBusinessActor,
  type BusinessActorInput,
} from "@/lib/services/business-actor-service";
import { syncFormulasForActor } from "@/lib/services/formula-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "1";
    const [actors, roles] = await Promise.all([
      listBusinessActors({ includeInactive }),
      listActorRoles(),
    ]);
    return NextResponse.json({ actors, roles });
  } catch (error) {
    console.error("GET /api/business-actors error:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar orang" },
      { status: 500 }
    );
  }
}

function parseActorInput(body: Record<string, unknown>): BusinessActorInput {
  const cats = body.cash_advance_categories;
  const catList = Array.isArray(cats)
    ? cats.map((s) => String(s).toUpperCase().trim()).filter(Boolean)
    : null;
  return {
    display_name: String(body.display_name ?? "").trim(),
    role_code: String(body.role_code ?? "").trim().toUpperCase(),
    notes: body.notes != null ? String(body.notes) : null,
    profit_share_percent:
      body.profit_share_percent !== undefined && body.profit_share_percent !== null
        ? Number(body.profit_share_percent)
        : null,
    cash_advance_categories: catList && catList.length > 0 ? catList : null,
    keperluan_keyword: body.keperluan_keyword != null
      ? String(body.keperluan_keyword)
      : null,
    bonus_percent:
      body.bonus_percent !== undefined && body.bonus_percent !== null
        ? Number(body.bonus_percent)
        : null,
    bonus_source_formula_key: body.bonus_source_formula_key != null
      ? String(body.bonus_source_formula_key)
      : null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action ?? "create");

    if (action === "create") {
      const input = parseActorInput(body);
      if (!input.display_name) {
        return NextResponse.json(
          { error: "Nama orang wajib diisi" },
          { status: 400 }
        );
      }
      if (!input.role_code) {
        return NextResponse.json(
          { error: "Peran wajib dipilih" },
          { status: 400 }
        );
      }
      const created = await createBusinessActor(input);
      if (created.error || !created.data) {
        return NextResponse.json(
          { error: created.error?.message || "Gagal menambah orang" },
          { status: 400 }
        );
      }
      await syncFormulasForActor(created.data.id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true, actor: created.data });
    }

    if (action === "update") {
      const id = String(body?.id ?? "");
      if (!id) {
        return NextResponse.json(
          { error: "ID orang wajib diisi" },
          { status: 400 }
        );
      }
      const input = parseActorInput(body);
      const updated = await updateBusinessActor(id, input);
      if (updated.error || !updated.data) {
        return NextResponse.json(
          { error: updated.error?.message || "Gagal memperbarui orang" },
          { status: 400 }
        );
      }
      await syncFormulasForActor(id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true, actor: updated.data });
    }

    if (action === "deactivate") {
      const id = String(body?.id ?? "");
      if (!id) {
        return NextResponse.json(
          { error: "ID orang wajib diisi" },
          { status: 400 }
        );
      }
      const res = await deactivateBusinessActor(id);
      if (res.error) {
        return NextResponse.json(
          { error: res.error.message },
          { status: 400 }
        );
      }
      // Disable the linked formula so the recalc skips it.
      await syncFormulasForActor(id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "reactivate") {
      const id = String(body?.id ?? "");
      if (!id) {
        return NextResponse.json(
          { error: "ID orang wajib diisi" },
          { status: 400 }
        );
      }
      const res = await reactivateBusinessActor(id);
      if (res.error) {
        return NextResponse.json(
          { error: res.error.message },
          { status: 400 }
        );
      }
      await syncFormulasForActor(id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body?.id ?? "");
      if (!id) {
        return NextResponse.json(
          { error: "ID orang wajib diisi" },
          { status: 400 }
        );
      }
      const res = await deleteBusinessActor(id);
      if (res.error) {
        return NextResponse.json(
          { error: res.error.message },
          { status: 400 }
        );
      }
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: `Action tidak dikenali: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/business-actors error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Gagal memproses orang" },
      { status: 500 }
    );
  }
}
