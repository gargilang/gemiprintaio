import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  getPurchaseById,
  updatePurchase,
  voidPurchase,
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
    await requireAdminOrManager();
    const params = await context.params;
    const body = await req.json();

    await updatePurchase(params.id, {
      nomor_pembelian: body.nomor_pembelian,
      nomor_faktur: body.nomor_faktur,
      vendor_id: body.vendor_id ?? null,
      tanggal: body.tanggal,
      metode_pembayaran: body.metode_pembayaran,
      catatan: body.catatan,
      items: Array.isArray(body.items)
        ? body.items.map((item: any) => ({
            ...item,
            panjang: item.panjang ?? null,
            lebar: item.lebar ?? null,
          }))
        : body.items,
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
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
    await requireAdminOrManager();
    const params = await context.params;

    await voidPurchase(params.id, "Pembelian dibatalkan via API");

    return NextResponse.json({
      message: "Pembelian berhasil dibatalkan",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error voiding purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to void purchase" },
      { status: 500 }
    );
  }
}
