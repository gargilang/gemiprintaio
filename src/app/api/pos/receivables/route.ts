import { NextResponse } from "next/server";
import { getReceivables } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const receivables = await getReceivables();
    return NextResponse.json({
      success: true,
      receivables,
    });
  } catch (error: any) {
    console.error("Error fetching receivables:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch receivables" },
      { status: 500 }
    );
  }
}
