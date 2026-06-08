import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  listKomponen,
  createKomponen,
  updateKomponen,
  deleteKomponen,
} from "@/lib/services/komponen-kompensasi-service";
import { komponenActionSchema } from "@/lib/schemas/payroll";

/** GET /api/penggajian/komponen?actor_id=... — daftar komponen (ungated read). */
export async function GET(req: NextRequest) {
  try {
    const actorId = req.nextUrl.searchParams.get("actor_id");
    if (!actorId) {
      return NextResponse.json(
        { error: "Parameter actor_id wajib diisi" },
        { status: 400 }
      );
    }
    const komponen = await listKomponen(actorId);
    return NextResponse.json({ komponen });
  } catch (error: any) {
    console.error("Error fetching komponen kompensasi:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat komponen kompensasi" },
      { status: 500 }
    );
  }
}

/** POST /api/penggajian/komponen — create | update | delete (guarded). */
export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const parsed = komponenActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data komponen tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    if (data.action === "create") {
      const komponen = await createKomponen(data);
      return NextResponse.json({ komponen }, { status: 201 });
    }
    if (data.action === "update") {
      const { id, action, ...patch } = data;
      await updateKomponen(id, patch);
      return NextResponse.json({ ok: true });
    }
    // delete
    await deleteKomponen(data.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error mutating komponen kompensasi:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menyimpan komponen kompensasi" },
      { status: 500 }
    );
  }
}
