import { NextRequest, NextResponse } from "next/server";

import { updateProductionItemStatus } from "@/lib/services/production-service";

const ITEM_STATUSES = [
  "MENUNGGU",
  "PRINTING",
  "FINISHING",
  "SELESAI",
] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const body = await request.json();
    const { status, operator_id } = body;
    const { itemId } = await params;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Status tidak boleh kosong" },
        { status: 400 }
      );
    }

    if (!ITEM_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: "Status tidak valid" },
        { status: 400 }
      );
    }

    await updateProductionItemStatus(itemId, {
      status,
      operator_id,
    });

    return NextResponse.json({
      success: true,
      message: "Status item berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error updating production item:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
