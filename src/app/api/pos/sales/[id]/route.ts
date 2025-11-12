import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = new Database(dbPath);
  let transactionStarted = false;

  try {
    const { id } = await params;

    // 1. Get sale details
    const sale = db
      .prepare(`SELECT * FROM penjualan WHERE id = ?`)
      .get(id) as any;

    if (!sale) {
      db.close();
      return NextResponse.json(
        { error: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    // 2. Get all items for this sale
    const items = db
      .prepare(
        `SELECT ip.*, b.lacak_inventori_status, b.jumlah_stok
         FROM item_penjualan ip
         JOIN barang b ON ip.barang_id = b.id
         WHERE ip.penjualan_id = ?`
      )
      .all(id) as any[];

    // 3. Start transaction
    db.exec("BEGIN TRANSACTION");
    transactionStarted = true;

    // 4. Reverse stock changes (add back to inventory)
    for (const item of items) {
      if (item.lacak_inventori_status === 1) {
        // Add back the quantity that was sold
        db.prepare(
          `UPDATE barang 
           SET jumlah_stok = jumlah_stok + ? 
           WHERE id = ?`
        ).run(item.jumlah, item.barang_id);
      }
    }

    // 5. Delete associated finance entries (using keperluan column which stores [REF:sale_id])
    db.prepare(`DELETE FROM keuangan WHERE keperluan LIKE ?`).run(
      `%[REF:${id}]%`
    );

    // 6. Check and delete piutang if exists (explicit, though CASCADE should handle it)
    const piutang = db
      .prepare(`SELECT id FROM piutang_penjualan WHERE id_penjualan = ?`)
      .get(id) as any;

    if (piutang) {
      // Delete pelunasan records first (though CASCADE should handle it)
      db.prepare(`DELETE FROM pelunasan_piutang WHERE id_piutang = ?`).run(
        piutang.id
      );

      // Delete piutang entry
      db.prepare(`DELETE FROM piutang_penjualan WHERE id = ?`).run(piutang.id);
    }

    // 7. Delete sale items (CASCADE will handle this, but explicit for clarity)
    db.prepare(`DELETE FROM item_penjualan WHERE penjualan_id = ?`).run(id);

    // 8. Delete the sale (this will CASCADE delete piutang and items if not done above)
    db.prepare(`DELETE FROM penjualan WHERE id = ?`).run(id);

    // 9. Commit transaction
    db.exec("COMMIT");
    transactionStarted = false;

    // 10. Recalculate cashbook
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Transaksi berhasil dihapus dan stok dikembalikan",
    });
  } catch (error: any) {
    // Only rollback if transaction was started
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    db.close();
    console.error("Error deleting sale:", error);
    return NextResponse.json(
      {
        error: "Gagal menghapus transaksi",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
