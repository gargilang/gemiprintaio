import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { payDebt } from "@/lib/services/purchases-service";
import { payDebtSchema } from "@/lib/schemas/pembelian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await req.json();

    const parsed = payDebtSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data pembayaran tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const result = await payDebt({
      purchase_id: data.purchase_id,
      jumlah_bayar: data.jumlah_bayar,
      tanggal_bayar: data.tanggal_bayar,
      metode_pembayaran: data.metode_pembayaran,
      referensi: data.referensi ?? undefined,
      catatan: data.catatan ?? undefined,
      dibuat_oleh: data.dibuat_oleh ?? undefined,
    });

    return NextResponse.json({
      message: "Pembayaran berhasil dicatat",
      status: result.status,
      sisa_hutang: result.sisa_hutang,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
