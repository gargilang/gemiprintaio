import { NextRequest, NextResponse } from "next/server";
import { deleteSale } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSale(id);

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dihapus dan stok dikembalikan",
    });
  } catch (error: any) {
    const msg = error?.message || "Gagal menghapus transaksi";
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Error deleting sale:", error);
    return NextResponse.json(
      { error: "Gagal menghapus transaksi", details: msg },
      { status: 500 }
    );
  }
}
