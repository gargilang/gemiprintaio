import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { createInventoryAdjustment } from "@/lib/services/inventory-service";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();
    const movement = await createInventoryAdjustment({
      barang_id: body.barang_id,
      qty_delta: Number(body.qty_delta),
      reason: String(body.reason || ""),
      unit_cost: body.unit_cost == null ? null : Number(body.unit_cost),
      tanggal: body.tanggal,
      dibuat_oleh: body.dibuat_oleh,
    });

    return NextResponse.json({ data: movement }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiError("Gagal menyimpan adjustment stok", 500, error);
  }
}
