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
        { error: "Missing required params: label and at" },
        { status: 400 }
      );
    }

    const report = await getFinancialReport(label, at);
    return NextResponse.json(report);
  } catch (error: unknown) {
    console.error("Generate financial report error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("No data found for this archive")) {
      return NextResponse.json(
        { error: "No data found for this archive" },
        { status: 404 }
      );
    }
    if (msg.includes("Missing required params")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiError("Failed to generate report", 500, error);
  }
}
