import { NextResponse } from "next/server";
import {
  requireProductionInventoryRole,
  AuthGuardError,
} from "@/lib/auth-guard-server";
import { friendlyPgError } from "@/lib/pg-error";
import { setOrderStatusSiapDiambilCascade } from "@/lib/services/production-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Web SPK menggunakan requireProductionInventoryRole untuk aksi Siap Diambil.
    await requireProductionInventoryRole();
    const { id } = await params;
    const result = await setOrderStatusSiapDiambilCascade(id);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    const errorMessage =
      error?.message
        ? friendlyPgError(error, "order_produksi")
        : "Gagal menandai SPK siap diambil";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 },
    );
  }
}
