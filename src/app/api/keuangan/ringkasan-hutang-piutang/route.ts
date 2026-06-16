import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

export async function GET() {
  try {
    let totalHutang = 0;
    let jumlahHutang = 0;
    let totalPiutang = 0;
    let jumlahPiutang = 0;

    const supabase = getServerSupabaseClient();
    if (supabase) {
      // Path Supabase: query langsung lewat PostgREST
      const [
        { data: hutangData, error: hutangErr },
        { data: piutangData, error: piutangErr },
      ] = await Promise.all([
        supabase
          .from("hutang_pembelian")
          .select("sisa_hutang")
          .eq("status", "AKTIF")
          .eq("is_deleted", 0),
        supabase
          .from("piutang_penjualan")
          .select("sisa_piutang")
          .in("status", ["AKTIF", "SEBAGIAN"])
          .eq("is_deleted", 0),
      ]);

      if (hutangErr) throw hutangErr;
      if (piutangErr) throw piutangErr;

      if (hutangData) {
        totalHutang = hutangData.reduce(
          (sum, row) => sum + Number(row.sisa_hutang ?? 0),
          0,
        );
        jumlahHutang = hutangData.length;
      }
      if (piutangData) {
        totalPiutang = piutangData.reduce(
          (sum, row) => sum + Number(row.sisa_piutang ?? 0),
          0,
        );
        jumlahPiutang = piutangData.length;
      }
    } else {
      // Path SQLite
      const hutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_hutang), 0) as sisa, COUNT(*) as count
         FROM hutang_pembelian
         WHERE status = 'AKTIF'
         AND COALESCE(is_deleted, 0) = 0`,
        [],
      );
      const piutangResult = await db.queryRaw<{ sisa: number; count: number }>(
        `SELECT COALESCE(SUM(sisa_piutang), 0) as sisa, COUNT(*) as count
         FROM piutang_penjualan
         WHERE status IN ('AKTIF', 'SEBAGIAN')
         AND COALESCE(is_deleted, 0) = 0`,
        [],
      );

      totalHutang = Number(hutangResult[0]?.sisa ?? 0);
      jumlahHutang = Number(hutangResult[0]?.count ?? 0);
      totalPiutang = Number(piutangResult[0]?.sisa ?? 0);
      jumlahPiutang = Number(piutangResult[0]?.count ?? 0);
    }

    return NextResponse.json({
      hutang: { total: totalHutang, jumlah: jumlahHutang },
      piutang: { total: totalPiutang, jumlah: jumlahPiutang },
    });
  } catch (error) {
    console.error("GET /api/keuangan/ringkasan-hutang-piutang error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan hutang piutang" },
      { status: 500 },
    );
  }
}
