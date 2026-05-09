import { NextRequest, NextResponse } from "next/server";
import {
  deleteManualCashBookEntry,
  updateManualCashBookEntry,
} from "@/lib/services/finance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const outcome = await deleteManualCashBookEntry(id);

    if (outcome === "not_found") {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    if (outcome === "purchase_linked") {
      return NextResponse.json(
        {
          error:
            "Transaksi pembelian harus dihapus melalui Halaman Pembelian",
          isPurchaseTransaction: true,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        message: "Transaksi berhasil dihapus dan data telah direcalculate",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/finance/cash-book/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus transaksi" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const outcome = await updateManualCashBookEntry(id, {
      tanggal: body.tanggal,
      kategori_transaksi: body.kategori_transaksi,
      debit: body.debit,
      kredit: body.kredit,
      keperluan: body.keperluan,
      catatan: body.catatan,
    });

    if (outcome === "not_found") {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    if (outcome === "purchase_linked") {
      return NextResponse.json(
        {
          error:
            "Transaksi pembelian harus diubah melalui Halaman Pembelian",
          isPurchaseTransaction: true,
        },
        { status: 403 }
      );
    }
    if (outcome === "invalid") {
      return NextResponse.json(
        {
          error:
            "Tanggal dan kategori wajib diisi; debit/kredit tidak boleh bersamaan atau keduanya nol",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: "Transaksi berhasil diupdate dan data telah direcalculate",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT /api/finance/cash-book/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengupdate transaksi" },
      { status: 500 }
    );
  }
}
