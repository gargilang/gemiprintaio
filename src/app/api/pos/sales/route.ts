import { NextResponse } from "next/server";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { createSale } from "@/lib/services/pos-service";
import { createSaleSchema } from "@/lib/schemas/pos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSession();
    const body = await request.json();

    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Data penjualan tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const result = await createSale({
      pelanggan_id: data.pelanggan_id,
      items: data.items,
      total_jumlah: data.total_jumlah,
      jumlah_dibayar: data.jumlah_dibayar,
      jumlah_kembalian: data.jumlah_kembalian,
      metode_pembayaran: data.metode_pembayaran,
      catatan: data.catatan,
      kasir_id: data.kasir_id,
      tanggal: data.tanggal,
      prioritas: data.prioritas,
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
