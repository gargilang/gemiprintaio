import { NextRequest, NextResponse } from "next/server";

import { getFinancialReport } from "@/lib/services/reports-service";

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
  } catch (error: any) {
    console.error("Generate financial report error:", error);
    const msg = error.message || "";
    if (msg.includes("No data found for this archive")) {
      return NextResponse.json(
        { error: "No data found for this archive" },
        { status: 404 }
      );
    }
    if (msg.includes("Missing required params")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
