import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { revertPayment } from "@/lib/services/purchases-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const purchase_id = body.purchase_id;

    if (!purchase_id) {
      return NextResponse.json(
        { error: "ID pembelian harus diisi" },
        { status: 400 }
      );
    }

    const { payments_deleted } = await revertPayment(purchase_id);

    return NextResponse.json({
      message: "Pembelian berhasil dikembalikan ke status HUTANG",
      payments_deleted,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const msg = error?.message || "Failed to revert payment";
    if (
      msg.includes("harus diisi") ||
      msg.includes("Hanya pembelian") ||
      msg.includes("TUNAI") ||
      msg.includes("CASH") ||
      msg.includes("tidak dapat direvert")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (msg.includes("tidak ditemukan")) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("Error reverting payment:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
