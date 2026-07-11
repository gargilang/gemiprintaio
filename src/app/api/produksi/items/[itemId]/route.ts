import { NextRequest, NextResponse } from "next/server";

import {
  requireSession,
  requireNotDemo,
  AuthGuardError,
} from "@/lib/auth-guard-server";
import { updateProductionItemStatus } from "@/lib/services/production-service";
import { itemStatusSchema } from "@/lib/schemas/produksi";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    await requireNotDemo(await requireSession());
    const body = await request.json();
    const { status, operator_id } = body;
    const { itemId } = await params;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Status tidak boleh kosong" },
        { status: 400 },
      );
    }

    if (!itemStatusSchema.safeParse(status).success) {
      return NextResponse.json(
        { success: false, error: "Status tidak valid" },
        { status: 422 },
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
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error("Error updating production item:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
