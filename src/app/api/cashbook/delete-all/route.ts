import { NextRequest, NextResponse } from "next/server";

import { deleteAllCashbook } from "@/lib/services/finance-service";

export async function DELETE(_request: NextRequest) {
  try {
    const result = await deleteAllCashbook();

    return NextResponse.json({
      success: true,
      deleted: result.deleted,
      message: `Transaksi aktif berhasil dihapus. Data arsip tetap tersimpan.`,
    });
  } catch (error: any) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete cash_book data", details: error.message },
      { status: 500 }
    );
  }
}
