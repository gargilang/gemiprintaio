import { NextResponse } from "next/server";
import { payReceivable } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      piutang_id,
      jumlah_bayar,
      tanggal_bayar,
      metode_pembayaran,
      referensi,
      catatan,
      dibuat_oleh,
    } = body;

    if (!piutang_id) {
      return NextResponse.json(
        { success: false, error: "Piutang ID tidak boleh kosong" },
        { status: 400 }
      );
    }

    const result = await payReceivable({
      piutang_id,
      jumlah_bayar,
      tanggal_bayar,
      metode_pembayaran,
      referensi,
      catatan,
      dibuat_oleh,
    });

    return NextResponse.json({
      success: true,
      message: "Pembayaran piutang berhasil dicatat",
      payment: {
        id: result.id,
        jumlah_bayar: result.jumlah_bayar,
        status_baru: result.status_baru,
        sisa_piutang: result.sisa_piutang,
      },
    });
  } catch (error: any) {
    const msg = error?.message || "Failed to process receivable payment";
    if (
      msg.includes("tidak ditemukan") ||
      msg.includes("melebihi") ||
      msg.includes("lebih dari 0")
    ) {
      return NextResponse.json(
        { success: false, error: msg },
        { status: msg.includes("tidak ditemukan") ? 404 : 400 }
      );
    }
    console.error("Error paying receivable:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
