import { NextRequest, NextResponse } from "next/server";
import {
  deletePartner,
  listPartners,
  upsertPartner,
} from "@/lib/services/cashbook-formula-service";
import { recalculateCashbookIfAvailable } from "@/lib/services/finance-service";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const partners = await listPartners();
    return NextResponse.json({ partners });
  } catch (error) {
    console.error("GET /api/cashbook-partner error:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar mitra" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const action = String(body?.action || "upsert");

    if (action === "delete") {
      const id = String(body?.id || "");
      if (!id) {
        return NextResponse.json(
          { error: "ID mitra wajib diisi" },
          { status: 400 }
        );
      }
      await deletePartner(id);
      await recalculateCashbookIfAvailable();
      return NextResponse.json({ ok: true });
    }

    const partner = body?.partner ?? body;
    if (!partner?.name) {
      return NextResponse.json(
        { error: "Nama mitra wajib diisi" },
        { status: 400 }
      );
    }

    const saved = await upsertPartner({
      id: partner.id,
      name: String(partner.name),
      category: partner.category ?? null,
      displayOrder: Number(partner.displayOrder ?? 0),
    });

    // Renaming a partner changes the value that `partnerRef` resolves to, so
    // we trigger a recalc just like we do for formula edits.
    await recalculateCashbookIfAvailable();
    return NextResponse.json({ ok: true, partner: saved });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/cashbook-partner error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Gagal menyimpan mitra" },
      { status: 500 }
    );
  }
}
