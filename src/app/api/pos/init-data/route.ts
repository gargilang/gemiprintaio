import { NextResponse } from "next/server";
import { getPOSInitData } from "@/lib/services/pos-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPOSInitData();
    return NextResponse.json({
      success: true,
      customers: data.customers,
      materials: data.materials,
      sales: data.sales,
      subkontraktor: data.subkontraktor,
    });
  } catch (error: any) {
    console.error("Error fetching POS init data:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch POS data" },
      { status: 500 },
    );
  }
}
