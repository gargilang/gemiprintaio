import { NextRequest, NextResponse } from "next/server";
import { revertSalePayment } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sale_id, dibuat_oleh } = body;

    if (!sale_id) {
      return NextResponse.json(
        { error: "ID penjualan harus diisi" },
        { status: 400 }
      );
    }

    const payments_deleted = await revertSalePayment({
      sale_id,
      dibuat_oleh,
    });

    return NextResponse.json({
      message:
        "Penjualan berhasil dikembalikan ke status AKTIF (piutang)",
      payments_deleted,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to revert sale payment";
    if (
      msg.includes("tidak memiliki piutang") ||
      msg.includes("tidak ada catatan") ||
      msg.includes("Tidak ada catatan")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Error reverting sale payment:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
