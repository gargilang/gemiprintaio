import { NextRequest, NextResponse } from "next/server";
import { deleteSale } from "@/lib/services/pos-service";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSale(id);

    const uid = request.headers.get("x-session-uid");
    await logAudit({
      userId: uid,
      action: "delete_sale",
      resourceType: "penjualan",
      resourceId: id,
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dihapus dan stok dikembalikan",
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Gagal menghapus transaksi";
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return apiError("Gagal menghapus transaksi", 500, error);
  }
}
