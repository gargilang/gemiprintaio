import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// GET single purchase by ID
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const db = getDb();

    const purchase: any = db
      .prepare(
        `
        SELECT 
          p.*,
          v.nama_perusahaan as vendor_name,
          profil.nama_lengkap as created_by_name
        FROM pembelian p
        LEFT JOIN vendor v ON p.vendor_id = v.id
        LEFT JOIN profil ON p.dibuat_oleh = profil.id
        WHERE p.id = ?
      `
      )
      .get(params.id);

    if (!purchase) {
      db.close();
      return NextResponse.json(
        { error: "Pembelian tidak ditemukan" },
        { status: 404 }
      );
    }

    const items = db
      .prepare(
        `
        SELECT 
          ip.*,
          b.nama as barang_name,
          ip.harga_satuan_id as id_satuan,
          ip.nama_satuan,
          ip.faktor_konversi,
          ip.harga_satuan as harga_beli
        FROM item_pembelian ip
        LEFT JOIN barang b ON ip.barang_id = b.id
        WHERE ip.pembelian_id = ?
      `
      )
      .all(params.id);

    db.close();

    return NextResponse.json({
      purchase: {
        ...purchase,
        items,
      },
    });
  } catch (error: any) {
    console.error("Error fetching purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch purchase" },
      { status: 500 }
    );
  }
}

// PUT update purchase
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = await req.json();
    const {
      nomor_pembelian,
      nomor_faktur,
      vendor_id,
      tanggal,
      metode_pembayaran,
      catatan,
      items,
    } = body;

    const db = getDb();

    // Check if purchase exists
    const existing = db
      .prepare("SELECT id FROM pembelian WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Pembelian tidak ditemukan" },
        { status: 404 }
      );
    }

    // Calculate new total
    let total_jumlah = 0;
    for (const item of items) {
      item.subtotal = item.jumlah * item.harga_satuan;
      total_jumlah += item.subtotal;
    }

    db.exec("BEGIN TRANSACTION");

    try {
      // Get old items to reverse stock changes
      const oldItems: any[] = db
        .prepare("SELECT * FROM item_pembelian WHERE pembelian_id = ?")
        .all(params.id);

      // Reverse old stock changes
      for (const oldItem of oldItems) {
        const stockToRemove = oldItem.jumlah * oldItem.faktor_konversi;
        db.prepare(
          `UPDATE barang 
           SET jumlah_stok = jumlah_stok - ?,
               diperbarui_pada = datetime('now')
           WHERE id = ?`
        ).run(stockToRemove, oldItem.barang_id);
      }

      // Delete old items
      db.prepare("DELETE FROM item_pembelian WHERE pembelian_id = ?").run(
        params.id
      );

      // Update purchase
      const updateStmt = db.prepare(`
        UPDATE pembelian
        SET nomor_pembelian = ?, nomor_faktur = ?, tanggal = ?, 
            vendor_id = ?, total_jumlah = ?,
            jumlah_dibayar = ?, metode_pembayaran = ?, catatan = ?,
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `);

      updateStmt.run(
        nomor_pembelian?.trim(),
        nomor_faktur?.trim() || nomor_pembelian?.trim(),
        tanggal || new Date().toISOString().split("T")[0],
        vendor_id || null,
        total_jumlah,
        metode_pembayaran === "CASH" ? total_jumlah : 0,
        metode_pembayaran || null,
        catatan?.trim() || null,
        params.id
      );

      // Insert new items
      const itemStmt = db.prepare(`
        INSERT INTO item_pembelian (
          id, pembelian_id, barang_id, harga_satuan_id,
          jumlah, nama_satuan, faktor_konversi,
          harga_satuan, subtotal, dibuat_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const item of items) {
        const itemId =
          item.id ||
          `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        itemStmt.run(
          itemId,
          params.id,
          item.barang_id,
          item.harga_satuan_id || null,
          item.jumlah,
          item.nama_satuan,
          item.faktor_konversi || 1,
          item.harga_satuan,
          item.subtotal
        );

        // Add new stock
        const stockToAdd = item.jumlah * (item.faktor_konversi || 1);
        db.prepare(
          `UPDATE barang 
           SET jumlah_stok = jumlah_stok + ?,
               diperbarui_pada = datetime('now')
           WHERE id = ?`
        ).run(stockToAdd, item.barang_id);

        // Update harga_beli
        if (item.harga_satuan_id) {
          db.prepare(
            `UPDATE harga_barang_satuan 
             SET harga_beli = ?,
                 diperbarui_pada = datetime('now')
             WHERE id = ?`
          ).run(item.harga_satuan, item.harga_satuan_id);
        }
      }

      // Update keuangan entry (only if it exists - LUNAS purchases)
      const keperluanText = vendor_id
        ? `Pembelian ${nomor_pembelian} (${
            nomor_faktur || nomor_pembelian
          }) [REF:${params.id}]`
        : `Pembelian ${nomor_pembelian} (${
            nomor_faktur || nomor_pembelian
          }) - Tanpa Vendor [REF:${params.id}]`;

      const updateResult = db
        .prepare(
          `UPDATE keuangan 
         SET kredit = ?, biaya_bahan = ?,
             tanggal = ?,
             keperluan = ?,
             catatan = ?,
             diperbarui_pada = datetime('now')
         WHERE keperluan LIKE ?`
        )
        .run(
          total_jumlah,
          total_jumlah,
          tanggal || new Date().toISOString().split("T")[0],
          keperluanText,
          catatan || null,
          `%[REF:${params.id}]%`
        );

      console.log(
        `Updated ${updateResult.changes} keuangan record(s) for purchase ${params.id}`
      );

      // Recalculate cashbook after update (if keuangan was updated)
      if (updateResult.changes > 0) {
        const { recalculateCashbook } = await import(
          "@/lib/calculate-cashbook"
        );
        await recalculateCashbook(db);
      }

      db.exec("COMMIT");

      // Get updated purchase
      const updatedPurchase: any = db
        .prepare(
          `SELECT p.*, v.nama_perusahaan as vendor_name 
           FROM pembelian p
           LEFT JOIN vendor v ON p.vendor_id = v.id
           WHERE p.id = ?`
        )
        .get(params.id);

      const updatedItems = db
        .prepare(
          `SELECT ip.*, b.nama as barang_name 
           FROM item_pembelian ip
           LEFT JOIN barang b ON ip.barang_id = b.id
           WHERE ip.pembelian_id = ?`
        )
        .all(params.id);

      db.close();

      return NextResponse.json({
        message: "Pembelian berhasil diupdate",
        purchase: {
          ...updatedPurchase,
          items: updatedItems,
        },
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error updating purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update purchase" },
      { status: 500 }
    );
  }
}

// DELETE purchase
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const db = getDb();

    // Check if purchase exists
    const existing = db
      .prepare("SELECT id FROM pembelian WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Pembelian tidak ditemukan" },
        { status: 404 }
      );
    }

    db.exec("BEGIN TRANSACTION");

    try {
      // Get items to reverse stock
      const items: any[] = db
        .prepare("SELECT * FROM item_pembelian WHERE pembelian_id = ?")
        .all(params.id);

      // Reverse stock changes
      for (const item of items) {
        const stockToRemove = item.jumlah * item.faktor_konversi;
        db.prepare(
          `UPDATE barang 
           SET jumlah_stok = jumlah_stok - ?,
               diperbarui_pada = datetime('now')
           WHERE id = ?`
        ).run(stockToRemove, item.barang_id);
      }

      // Delete keuangan entry by finding reference to purchase ID
      const deleteResult = db
        .prepare("DELETE FROM keuangan WHERE keperluan LIKE ?")
        .run(`%[REF:${params.id}]%`);

      console.log(
        `Deleted ${deleteResult.changes} keuangan record(s) for purchase ${params.id}`
      );

      // Delete purchase (items will cascade delete)
      db.prepare("DELETE FROM pembelian WHERE id = ?").run(params.id);

      // Recalculate cashbook after deletion
      const { recalculateCashbook } = await import("@/lib/calculate-cashbook");
      await recalculateCashbook(db);

      db.exec("COMMIT");
      db.close();

      return NextResponse.json({
        message: "Pembelian berhasil dihapus",
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error deleting purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete purchase" },
      { status: 500 }
    );
  }
}
