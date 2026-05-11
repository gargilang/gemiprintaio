import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { db, getServerSupabaseClient } from "@/lib/db-unified";
import { createCashBookEntry } from "@/lib/services/finance-service";
import { fetchKeuanganCashBookListActive } from "@/lib/server-data-supabase";

export async function GET() {
  try {
    if (getServerSupabaseClient()) {
      const cashBooks = await fetchKeuanganCashBookListActive();
      return NextResponse.json({ cashBooks });
    }

    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan 
         WHERE diarsipkan_pada IS NULL 
         ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
        []
      )) || [];

    return NextResponse.json({ cashBooks });
  } catch (error) {
    console.error("GET /api/finance/cash-book error:", error);
    return NextResponse.json(
      { error: "Gagal memuat data keuangan" },
      { status: 500 }
    );
  }
}

function isClientValidationMessage(msg: string): boolean {
  return (
    msg.includes("wajib diisi") ||
    msg.includes("Tidak boleh mengisi debit dan kredit") ||
    msg.includes("Debit atau kredit harus diisi")
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tanggal,
      kategori_transaksi,
      debit = 0,
      kredit = 0,
      keperluan = "",
      catatan = "",
      dibuat_oleh = "",
    } = body;

    const { cashBook } = await createCashBookEntry({
      tanggal,
      kategori_transaksi,
      debit,
      kredit,
      keperluan,
      catatan,
      dibuat_oleh,
    });

    return NextResponse.json(
      { message: "Transaksi berhasil ditambahkan", cashBook },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/finance/cash-book error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg && isClientValidationMessage(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Gagal menambahkan transaksi" },
      { status: 500 }
    );
  }
}
