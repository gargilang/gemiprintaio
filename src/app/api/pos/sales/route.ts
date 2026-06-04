import { NextResponse } from "next/server";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { createSale } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();

    const result = await createSale({
      pelanggan_id: body.pelanggan_id,
      items: body.items,
      total_jumlah: body.total_jumlah,
      jumlah_dibayar: body.jumlah_dibayar,
      jumlah_kembalian: body.jumlah_kembalian,
      metode_pembayaran: body.metode_pembayaran,
      catatan: body.catatan,
      kasir_id: body.kasir_id,
      tanggal: body.tanggal,
      prioritas: body.prioritas,
    });

    return NextResponse.json({
      success: true,
      sale: {
        id: result.id,
        nomor_faktur: result.nomor_faktur,
      },
      spk_number: result.spk_number,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    const msg = error?.message || "Failed to create sale";
    if (
      msg.includes("kosong") ||
      msg.includes("lebih dari 0") ||
      msg.includes("Items")
    ) {
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    console.error("Error creating sale:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
