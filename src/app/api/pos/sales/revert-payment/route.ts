import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import Database from "better-sqlite3";
import path from "path";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// POST to revert a paid sale back to AKTIF piutang status
export async function POST(req: NextRequest) {
  const db = new Database(dbPath);
  let transactionStarted = false;

  try {
    const body = await req.json();
    const { sale_id, dibuat_oleh } = body;

    if (!sale_id) {
      db.close();
      return NextResponse.json(
        { error: "ID penjualan harus diisi" },
        { status: 400 }
      );
    }

    // Get sale details
    const sale: any = db
      .prepare(
        `
        SELECT 
          id, nomor_invoice, pelanggan_id, total_jumlah, 
          jumlah_dibayar, jumlah_kembalian, 
          metode_pembayaran, catatan, kasir_id, dibuat_pada
        FROM penjualan
        WHERE id = ?
      `
      )
      .get(sale_id);

    if (!sale) {
      db.close();
      return NextResponse.json(
        { error: "Penjualan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if sale has piutang record
    const piutangRecord: any = db
      .prepare("SELECT * FROM piutang_penjualan WHERE id_penjualan = ?")
      .get(sale_id);

    if (!piutangRecord) {
      db.close();
      return NextResponse.json(
        {
          error:
            "Transaksi ini tidak memiliki piutang. Hanya transaksi dengan piutang yang dapat direvert.",
        },
        { status: 400 }
      );
    }

    // Check if there are any payment records (pelunasan)
    const paymentCount: any = db
      .prepare(
        "SELECT COUNT(*) as count FROM pelunasan_piutang WHERE id_piutang = ?"
      )
      .get(piutangRecord.id);

    if (!paymentCount || paymentCount.count === 0) {
      db.close();
      return NextResponse.json(
        {
          error:
            "Tidak ada catatan pembayaran piutang untuk transaksi ini. Tidak ada yang perlu direvert.",
        },
        { status: 400 }
      );
    }

    // Begin transaction
    db.exec("BEGIN TRANSACTION");
    transactionStarted = true;

    // Get all payment records (pelunasan_piutang) for this piutang
    const payments: any[] = db
      .prepare(
        "SELECT * FROM pelunasan_piutang WHERE id_piutang = ? ORDER BY tanggal_bayar ASC"
      )
      .all(piutangRecord.id);

    // Delete all pelunasan_piutang records
    db.prepare("DELETE FROM pelunasan_piutang WHERE id_piutang = ?").run(
      piutangRecord.id
    );

    // Delete all related keuangan entries (payment records with matching invoice)
    // Format: "Bayar Piutang INV-xxxxx - Customer (Status) [REF:sale-xxxxx]"
    db.prepare(
      `DELETE FROM keuangan 
       WHERE (kategori_transaksi = 'LUNAS' OR kategori_transaksi = 'PIUTANG')
       AND keperluan LIKE ?`
    ).run(`%${sale.nomor_invoice}%`);

    // Reset piutang_penjualan to original state (all unpaid)
    db.prepare(
      `
      UPDATE piutang_penjualan 
      SET jumlah_terbayar = 0,
          sisa_piutang = jumlah_piutang,
          status = 'AKTIF',
          diperbarui_pada = datetime('now')
      WHERE id = ?
    `
    ).run(piutangRecord.id);

    // Update penjualan diperbarui_pada (no status_pembayaran column exists)
    db.prepare(
      `
      UPDATE penjualan 
      SET diperbarui_pada = datetime('now')
      WHERE id = ?
    `
    ).run(sale_id);

    // Commit transaction
    db.exec("COMMIT");
    transactionStarted = false;

    // Recalculate cashbook
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      message: "Penjualan berhasil dikembalikan ke status AKTIF (piutang)",
      payments_deleted: payments.length,
    });
  } catch (error: any) {
    if (transactionStarted) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError);
      }
    }
    db.close();
    console.error("Error reverting sale payment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to revert sale payment" },
      { status: 500 }
    );
  }
}
