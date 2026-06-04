/**
 * GET /api/finance/categories — kategori transaksi buku kas (untuk picker Kasbon).
 */

import { NextResponse } from "next/server";

import { listFinanceCategories } from "@/lib/services/finance-config-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories = await listFinanceCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("GET /api/finance/categories error:", error);
    return NextResponse.json(
      { error: "Gagal memuat daftar kategori" },
      { status: 500 }
    );
  }
}
