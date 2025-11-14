/**
 * DEPRECATED: Use getDebts() from purchases-service.ts
 * @see /src/lib/services/purchases-service.ts
 */
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";

function generateId(prefix: string = "payment") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all purchases with debt status (HUTANG or SEBAGIAN)
export async function GET(req: NextRequest) {
  try {
    const db = await getDatabaseAsync();

    const debts = db
      .prepare(
        `
        SELECT 
          p.id,
          p.nomor_pembelian,
          p.nomor_faktur,
          p.tanggal,
          p.total_jumlah,
          p.jumlah_dibayar,
          p.status_pembayaran,
          (p.total_jumlah - p.jumlah_dibayar) as sisa_hutang,
          v.nama_perusahaan as vendor_name
        FROM pembelian p
        LEFT JOIN vendor v ON p.vendor_id = v.id
        WHERE p.status_pembayaran IN ('HUTANG', 'SEBAGIAN')
        ORDER BY p.tanggal ASC, p.dibuat_pada ASC
      `
      )
      .all();

    return NextResponse.json({ debts });
  } catch (error: any) {
    console.error("Error fetching debts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch debts" },
      { status: 500 }
    );
  }
}
