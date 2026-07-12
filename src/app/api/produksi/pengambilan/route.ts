import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOperationalRole, AuthGuardError } from "@/lib/auth-guard-server";
import { friendlyPgError } from "@/lib/pg-error";
import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "@/lib/services/pengambilan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusQuerySchema = z.enum(["belum", "sudah"]);

export async function GET(request: NextRequest | Request) {
  try {
    await requireOperationalRole();
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status") || "belum";
    const parse = statusQuerySchema.safeParse(rawStatus);
    if (!parse.success) {
      return NextResponse.json(
        { success: false, error: "Status tidak valid" },
        { status: 400 },
      );
    }
    const rows =
      parse.data === "sudah"
        ? await listPengambilanSudahDiambil(100)
        : await listPengambilanBelumDiambil();

    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      );
    }
    console.error("GET /api/produksi/pengambilan error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message
          ? friendlyPgError(error, "order_produksi")
          : "Gagal memuat pengambilan",
      },
      { status: 500 },
    );
  }
}
