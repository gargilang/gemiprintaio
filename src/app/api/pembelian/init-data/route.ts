import { NextResponse } from "next/server";
import { getInitData } from "@/lib/services/purchases-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aggregate endpoint for the purchases page (single request).
 */
export async function GET() {
  try {
    const data = await getInitData();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching purchases init data:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch data" },
      { status: 500 }
    );
  }
}
