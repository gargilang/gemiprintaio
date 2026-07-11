import { NextRequest, NextResponse } from "next/server";

import {
  requireSession,
  requireNotDemo,
  AuthGuardError,
} from "@/lib/auth-guard-server";
import {
  createProductionOrder,
  getProductionOrders,
} from "@/lib/services/production-service";

export async function GET() {
  try {
    const orders = await getProductionOrders();
    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    console.error("Error fetching production orders:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireNotDemo(await requireSession());
    const body = await request.json();
    const {
      penjualan_id,
      items,
      prioritas,
      tanggal_deadline,
      catatan,
      dibuat_oleh,
    } = body;

    if (!penjualan_id || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Data tidak lengkap" },
        { status: 400 },
      );
    }

    const result = await createProductionOrder({
      penjualan_id,
      items,
      prioritas,
      tanggal_deadline,
      catatan,
      dibuat_oleh,
    });

    return NextResponse.json({
      success: true,
      message: "Order produksi berhasil dibuat",
      order_id: result.id,
      nomor_spk: result.nomor_spk,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error("Error creating production order:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
