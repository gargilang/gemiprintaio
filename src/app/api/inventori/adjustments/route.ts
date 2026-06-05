import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { createInventoryAdjustment } from "@/lib/services/inventory-service";
import { apiError } from "@/lib/api-error";
import { inventoryAdjustmentSchema } from "@/lib/schemas/inventori";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await request.json();

    const parsed = inventoryAdjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data penyesuaian stok tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const movement = await createInventoryAdjustment({
      barang_id: data.barang_id,
      qty_delta: data.qty_delta,
      reason: String(data.reason || ""),
      unit_cost: data.unit_cost == null ? null : data.unit_cost,
      tanggal: data.tanggal,
      dibuat_oleh: data.dibuat_oleh,
    });

    return NextResponse.json({ data: movement }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return apiError("Gagal menyimpan adjustment stok", 500, error);
  }
}
