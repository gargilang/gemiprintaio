import { NextResponse } from "next/server";
import { requireOperationalRole, AuthGuardError } from "@/lib/auth-guard-server";
import { friendlyPgError } from "@/lib/pg-error";
import { markOrderSudahDiambil } from "@/lib/services/production-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await requireOperationalRole();
    const { orderId } = await params;
    const result = await markOrderSudahDiambil(orderId);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    const isBizError = String(error?.message || "").includes("belum siap diambil");
    const status = isBizError ? 400 : 500;
    const errorMessage =
      isBizError
        ? (error.message as string)
        : error?.message
          ? friendlyPgError(error, "order_produksi")
          : "Gagal menandai SPK sudah diambil";
    return NextResponse.json({ success: false, error: errorMessage }, { status });
  }
}
