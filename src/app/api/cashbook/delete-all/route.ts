import { NextRequest, NextResponse } from "next/server";

import { deleteAllCashbook } from "@/lib/services/finance-service";
import { logAudit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdminOrManager();
    const result = await deleteAllCashbook();

    await logAudit({
      userId: session.uid,
      action: "delete_all_cashbook",
      resourceType: "cash_book",
      details: { deleted: result.deleted },
      ipAddress:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: `Transaksi aktif berhasil dihapus. Data arsip tetap tersimpan.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status);
    }
    console.error("Delete error:", error);
    return apiError("Failed to delete cash_book data", 500, error);
  }
}
