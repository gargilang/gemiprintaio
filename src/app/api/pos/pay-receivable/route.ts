import { NextResponse } from "next/server";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { payReceivable } from "@/lib/services/pos-service";
import { payReceivableSchema } from "@/lib/schemas/inventori";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();

    const parsed = payReceivableSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Data pembayaran tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const result = await payReceivable({
      piutang_id: data.piutang_id,
      jumlah_bayar: data.jumlah_bayar,
      tanggal_bayar: data.tanggal_bayar,
      metode_pembayaran: data.metode_pembayaran,
      referensi: data.referensi ?? undefined,
      catatan: data.catatan ?? undefined,
      dibuat_oleh: data.dibuat_oleh ?? undefined,
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
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
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
