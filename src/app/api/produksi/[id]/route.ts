import { NextRequest, NextResponse } from "next/server";

import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { updateProductionOrderStatus } from "@/lib/services/production-service";

const ORDER_STATUSES = ["MENUNGGU", "PROSES", "SELESAI", "DIBATALKAN"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const body = await request.json();
    const { status } = body;
    const { id: orderId } = await params;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Status tidak boleh kosong" },
        { status: 400 }
      );
    }

    if (!ORDER_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: "Status tidak valid" },
        { status: 400 }
      );
    }

    await updateProductionOrderStatus(orderId, status);

    return NextResponse.json({
      success: true,
      message: "Status order berhasil diperbarui",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error updating production order:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
