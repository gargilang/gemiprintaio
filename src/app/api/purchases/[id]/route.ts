import { NextRequest, NextResponse } from "next/server";
import {
  deletePurchase,
  getPurchaseById,
  updatePurchase,
} from "@/lib/services/purchases-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const purchase = await getPurchaseById(params.id);

    if (!purchase) {
      return NextResponse.json(
        { error: "Pembelian tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      purchase: {
        ...purchase,
        items: purchase.items,
      },
    });
  } catch (error: any) {
    console.error("Error fetching purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch purchase" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = await req.json();

    await updatePurchase(params.id, {
      nomor_pembelian: body.nomor_pembelian,
      nomor_faktur: body.nomor_faktur,
      vendor_id: body.vendor_id ?? null,
      tanggal: body.tanggal,
      metode_pembayaran: body.metode_pembayaran,
      catatan: body.catatan,
      items: body.items,
    });

    const updated = await getPurchaseById(params.id);

    return NextResponse.json({
      message: "Pembelian berhasil diupdate",
      purchase: updated
        ? {
            ...updated,
            items: updated.items,
          }
        : null,
    });
  } catch (error: any) {
    console.error("Error updating purchase:", error);
    const msg = error?.message || "Failed to update purchase";
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;

    await deletePurchase(params.id);

    return NextResponse.json({
      message: "Pembelian berhasil dihapus",
    });
  } catch (error: any) {
    console.error("Error deleting purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete purchase" },
      { status: 500 }
    );
  }
}
