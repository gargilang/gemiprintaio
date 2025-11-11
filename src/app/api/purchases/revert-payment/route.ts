import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

function generateId(prefix: string = "payment") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// POST to revert a paid purchase back to HUTANG status
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { purchase_id, dibuat_oleh } = body;

    if (!purchase_id) {
      return NextResponse.json(
        { error: "ID pembelian harus diisi" },
        { status: 400 }
      );
    }

    const db = await getDatabaseAsync();

    // Get purchase details
    const purchase: any = db
      .prepare(
        `
        SELECT 
          id, nomor_pembelian, nomor_faktur, tanggal, 
          vendor_id, total_jumlah, jumlah_dibayar, 
          status_pembayaran, catatan, metode_pembayaran
        FROM pembelian
        WHERE id = ?
      `
      )
      .get(purchase_id);

    if (!purchase) {
      return NextResponse.json(
        { error: "Pembelian tidak ditemukan" },
        { status: 404 }
      );
    }

    // Only allow revert if status is LUNAS
    if (purchase.status_pembayaran !== "LUNAS") {
      return NextResponse.json(
        {
          error:
            "Hanya pembelian dengan status LUNAS yang dapat direvert ke HUTANG",
        },
        { status: 400 }
      );
    }

    // Only allow revert if payment was made via HUTANG (not CASH)
    if (purchase.metode_pembayaran === "CASH") {
      return NextResponse.json(
        {
          error:
            "Pembelian dengan metode CASH tidak dapat direvert. Hapus saja pembelian jika salah.",
        },
        { status: 400 }
      );
    }

    // Begin transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Get hutang_pembelian record
      const hutangRecord: any = db
        .prepare("SELECT * FROM hutang_pembelian WHERE id_pembelian = ?")
        .get(purchase_id);

      if (!hutangRecord) {
        db.exec("ROLLBACK");
        return NextResponse.json(
          { error: "Data hutang tidak ditemukan" },
          { status: 404 }
        );
      }

      // Get all payment records (pelunasan_hutang) for this hutang
      const payments: any[] = db
        .prepare(
          "SELECT * FROM pelunasan_hutang WHERE id_hutang = ? ORDER BY tanggal_bayar ASC"
        )
        .all(hutangRecord.id);

      if (payments.length === 0) {
        db.exec("ROLLBACK");
        return NextResponse.json(
          { error: "Tidak ada catatan pembayaran yang ditemukan" },
          { status: 404 }
        );
      }

      // Delete all pelunasan_hutang records
      db.prepare("DELETE FROM pelunasan_hutang WHERE id_hutang = ?").run(
        hutangRecord.id
      );

      // Delete all related keuangan entries (SUPPLY category with matching nomor_faktur)
      // We'll search for entries that reference this purchase's nomor_faktur
      db.prepare(
        `DELETE FROM keuangan 
         WHERE kategori_transaksi = 'SUPPLY' 
         AND keperluan LIKE ?`
      ).run(`%${purchase.nomor_faktur}%`);

      // Reset hutang_pembelian
      db.prepare(
        `
        UPDATE hutang_pembelian 
        SET jumlah_terbayar = 0,
            sisa_hutang = jumlah_hutang,
            status = 'AKTIF',
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `
      ).run(hutangRecord.id);

      // Reset pembelian to HUTANG status
      db.prepare(
        `
        UPDATE pembelian 
        SET jumlah_dibayar = 0,
            status_pembayaran = 'HUTANG',
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `
      ).run(purchase_id);

      // Recalculate all cashbook entries after deletion
      // This is CRITICAL - we need to recalculate running balances for all subsequent entries
      await recalculateCashbook(db);

      // Commit transaction
      db.exec("COMMIT");

      return NextResponse.json({
        message: "Pembelian berhasil dikembalikan ke status HUTANG",
        payments_deleted: payments.length,
      });
    } catch (err: any) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    console.error("Error reverting payment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to revert payment" },
      { status: 500 }
    );
  }
}
