import { NextResponse } from "next/server";
import { getFinanceConfig } from "@/lib/services/finance-config-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = await getFinanceConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error("GET /api/finance/config error:", error);
    return NextResponse.json(
      { error: "Gagal memuat konfigurasi keuangan" },
      { status: 500 }
    );
  }
}
