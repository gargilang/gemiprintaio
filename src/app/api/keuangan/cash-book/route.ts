import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { db, getServerSupabaseClient } from "@/lib/db-unified";
import { createCashBookEntry } from "@/lib/services/finance-service";
import { fetchKeuanganCashBookListActive } from "@/lib/server-data-supabase";
import { getLatestPerFormulaKey } from "@/lib/services/transaction-computed-service";

export async function GET() {
  try {
    if (getServerSupabaseClient()) {
      // Fetch cashbook rows + computed metrics in parallel — both queries
      // hit Supabase so they share the same network latency. systemMetrics
      // exposes the v2 transaksi_terhitung values (kas, modal_kas, etc.)
      // alongside the legacy keuangan columns so the UI can render every
      // summary card from a single endpoint instead of two.
      const [cashBooks, latestMap] = await Promise.all([
        fetchKeuanganCashBookListActive(),
        getLatestPerFormulaKey(),
      ]);
      const systemMetrics = {
        omzet: latestMap.omzet ?? 0,
        biaya_operasional: latestMap.biaya_operasional ?? 0,
        biaya_bahan: latestMap.biaya_bahan ?? 0,
        saldo: latestMap.saldo ?? 0,
        laba_bersih: latestMap.laba_bersih ?? 0,
        modal_kas: latestMap.modal_kas ?? 0,
        saldo_kasbon: latestMap.saldo_kasbon ?? 0,
        kas: latestMap.kas ?? 0,
      };
      return NextResponse.json({ cashBooks, systemMetrics });
    }

    const cashBooks =
      (await db.queryRaw(
        `SELECT * FROM keuangan 
         WHERE diarsipkan_pada IS NULL 
         ORDER BY urutan_tampilan DESC, dibuat_pada DESC`,
        []
      )) || [];
    const latestMap = await getLatestPerFormulaKey();
    const systemMetrics = {
      omzet: latestMap.omzet ?? 0,
      biaya_operasional: latestMap.biaya_operasional ?? 0,
      biaya_bahan: latestMap.biaya_bahan ?? 0,
      saldo: latestMap.saldo ?? 0,
      laba_bersih: latestMap.laba_bersih ?? 0,
      modal_kas: latestMap.modal_kas ?? 0,
      saldo_kasbon: latestMap.saldo_kasbon ?? 0,
      kas: latestMap.kas ?? 0,
    };

    return NextResponse.json({ cashBooks, systemMetrics });
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
    await requireAdminOrManager();
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
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
