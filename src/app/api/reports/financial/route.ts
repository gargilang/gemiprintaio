import { NextRequest, NextResponse } from "next/server";

import { getFinancialReport } from "@/lib/services/reports-service";
import { apiError } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      return NextResponse.json(
        { error: "Parameter wajib belum lengkap: label dan at" },
        { status: 400 }
      );
    }

    const report = await getFinancialReport(label, at);
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error("Gagal membuat laporan keuangan:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Tidak ada data untuk arsip ini")) {
      return NextResponse.json(
        { error: "Tidak ada data untuk arsip ini" },
        { status: 404 }
      );
    }
    if (msg.includes("Parameter wajib belum lengkap")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiError("Gagal membuat laporan", 500, error);
  }
}
