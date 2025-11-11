import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const db = await getDatabaseAsync();

    // Cek apakah transaksi ada
    const existingEntry = db
      .prepare(`SELECT * FROM keuangan WHERE id = ?`)
      .get(id) as any;

    if (!existingEntry) {
      console.log(`Transaction not found: ${id}`);
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if this transaction is from purchases (has [REF:purchase-xxx])
    if (
      existingEntry.keperluan &&
      existingEntry.keperluan.includes("[REF:purchase-")
    ) {
      console.log(`Cannot delete purchase transaction: ${id}`);
      return NextResponse.json(
        {
          error: "Transaksi pembelian harus dihapus melalui Halaman Pembelian",
          isPurchaseTransaction: true,
        },
        { status: 403 }
      );
    }

    console.log(`Deleting transaction: ${id}`);

    // Delete transaksi
    db.prepare(`DELETE FROM keuangan WHERE id = ?`).run(id);

    // Recalculate all remaining transactions (respecting manual overrides)
    await recalculateCashbook(db);

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
    const { tanggal, kategori_transaksi, debit, kredit, keperluan, catatan } =
      body;

    const db = await getDatabaseAsync();

    // Cek apakah transaksi ada
    const existingEntry = db
      .prepare(`SELECT * FROM keuangan WHERE id = ?`)
      .get(id) as any;

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if this transaction is from purchases (has [REF:purchase-xxx])
    if (
      existingEntry.keperluan &&
      existingEntry.keperluan.includes("[REF:purchase-")
    ) {
      console.log(`Cannot edit purchase transaction: ${id}`);
      return NextResponse.json(
        {
          error: "Transaksi pembelian harus diubah melalui Halaman Pembelian",
          isPurchaseTransaction: true,
        },
        { status: 403 }
      );
    }

    console.log(`Updating transaction: ${id}`);

    // Validasi input
    if (!tanggal || !kategori_transaksi) {
      return NextResponse.json(
        { error: "Tanggal dan kategori wajib diisi" },
        { status: 400 }
      );
    }

    // Validasi: debit dan kredit tidak boleh diisi bersamaan
    const debitVal = debit || 0;
    const kreditVal = kredit || 0;

    if (debitVal > 0 && kreditVal > 0) {
      return NextResponse.json(
        { error: "Tidak boleh mengisi debit dan kredit bersamaan" },
        { status: 400 }
      );
    }

    if (debitVal === 0 && kreditVal === 0) {
      return NextResponse.json(
        { error: "Debit atau kredit harus diisi" },
        { status: 400 }
      );
    }

    // Update transaksi
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE keuangan 
      SET tanggal = ?, 
          kategori_transaksi = ?, 
          debit = ?, 
          kredit = ?, 
          keperluan = ?, 
          catatan = ?,
          diperbarui_pada = ?
      WHERE id = ?
    `
    ).run(
      tanggal,
      kategori_transaksi,
      debitVal,
      kreditVal,
      keperluan || "",
      catatan || "",
      now,
      id
    );

    // Recalculate all transactions (respecting manual overrides)
    await recalculateCashbook(db);

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
