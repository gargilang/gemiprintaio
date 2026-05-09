import { NextRequest, NextResponse } from "next/server";
import { payDebt } from "@/lib/services/purchases-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await payDebt({
      purchase_id: body.purchase_id,
      jumlah_bayar: body.jumlah_bayar,
      tanggal_bayar: body.tanggal_bayar,
      metode_pembayaran: body.metode_pembayaran,
      referensi: body.referensi,
      catatan: body.catatan,
      dibuat_oleh: body.dibuat_oleh,
    });

    return NextResponse.json({
      message: "Pembayaran berhasil dicatat",
      status: result.status,
      sisa_hutang: result.sisa_hutang,
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to process payment";
    if (
      msg.includes("harus diisi") ||
      msg.includes("harus lebih") ||
      msg.includes("melebihi")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Error paying debt:", error);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
