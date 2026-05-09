import { NextResponse } from "next/server";
import { getDebts } from "@/lib/services/purchases-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pembelian dengan status HUTANG / SEBAGIAN */
export async function GET() {
  try {
    const debts = await getDebts();
    return NextResponse.json({ debts });
  } catch (error: any) {
    console.error("Error fetching debts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch debts" },
      { status: 500 }
    );
  }
}
