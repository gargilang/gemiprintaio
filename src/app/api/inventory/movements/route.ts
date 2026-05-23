import { NextRequest, NextResponse } from "next/server";
import { getInventoryMovements } from "@/lib/services/inventory-service";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const movements = await getInventoryMovements({
      barang_id: params.get("barang_id") || undefined,
      source_id: params.get("source_id") || undefined,
      source_type: params.get("source_type") || undefined,
    });

    return NextResponse.json({ data: movements });
  } catch (error) {
    return apiError("Gagal memuat riwayat stok", 500, error);
  }
}
