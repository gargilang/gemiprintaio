import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "purchase") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all purchases with details
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    // Get all purchases with vendor info
    const purchases = db
      .prepare(
        `
        SELECT 
          p.*,
          v.nama_perusahaan as vendor_name,
          profil.nama_lengkap as created_by_name
        FROM pembelian p
        LEFT JOIN vendor v ON p.vendor_id = v.id
        LEFT JOIN profil ON p.dibuat_oleh = profil.id
        ORDER BY p.dibuat_pada DESC
      `
      )
      .all();

    // Get items for each purchase
    const purchasesWithItems = purchases.map((purchase: any) => {
      const items = db
        .prepare(
          `
          SELECT 
            ip.*,
            b.nama as nama_barang,
            ip.nama_satuan,
            ip.faktor_konversi,
            ip.harga_satuan as harga_beli
          FROM item_pembelian ip
          LEFT JOIN barang b ON ip.barang_id = b.id
          WHERE ip.pembelian_id = ?
        `
        )
        .all(purchase.id);

      // Calculate total_harga from items (using subtotal from table or calculate it)
      const total_harga = items.reduce(
        (sum: number, item: any) =>
          sum + (item.subtotal || item.jumlah * item.harga_satuan),
        0
      );

      return {
        ...purchase,
        items,
        total_harga,
      };
    });

    db.close();

    return NextResponse.json({ purchases: purchasesWithItems });
  } catch (error: any) {
    console.error("Error fetching purchases:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch purchases" },
      { status: 500 }
    );
  }
}

// POST create new purchase
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nomor_pembelian,
      vendor_id,
      tanggal,
      metode_pembayaran,
      catatan,
      items, // Array of purchase items
      dibuat_oleh,
    } = body;

    if (!nomor_pembelian || !nomor_pembelian.trim()) {
      return NextResponse.json(
        { error: "Nomor pembelian harus diisi" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Minimal harus ada 1 item pembelian" },
        { status: 400 }
      );
    }

    // Calculate total
    let total_jumlah = 0;
    for (const item of items) {
      if (!item.barang_id) {
        return NextResponse.json(
          { error: "Setiap item harus memiliki barang" },
          { status: 400 }
        );
      }
      if (!item.jumlah || item.jumlah <= 0) {
        return NextResponse.json(
          { error: "Jumlah item harus lebih dari 0" },
          { status: 400 }
        );
      }
      if (!item.harga_satuan || item.harga_satuan < 0) {
        return NextResponse.json(
          { error: "Harga satuan harus valid" },
          { status: 400 }
        );
      }
      item.subtotal = item.jumlah * item.harga_satuan;
      total_jumlah += item.subtotal;
    }

    const db = getDb();

    // Check if nomor_pembelian already exists
    const existing = db
      .prepare("SELECT id FROM pembelian WHERE nomor_pembelian = ?")
      .get(nomor_pembelian.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Nomor pembelian sudah digunakan" },
        { status: 400 }
      );
    }

    const purchaseId = generateId("purchase");

    // Begin transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Insert purchase
      const purchaseStmt = db.prepare(`
        INSERT INTO pembelian (
          id, nomor_pembelian, vendor_id, total_jumlah,
          jumlah_dibayar, metode_pembayaran, catatan,
          dibuat_oleh, dibuat_pada, diperbarui_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      purchaseStmt.run(
        purchaseId,
        nomor_pembelian.trim(),
        vendor_id || null,
        total_jumlah,
        metode_pembayaran === "cash" ? total_jumlah : 0,
        metode_pembayaran || null,
        catatan?.trim() || null,
        dibuat_oleh || null
      );

      // Insert items and update stock & prices
      const itemStmt = db.prepare(`
        INSERT INTO item_pembelian (
          id, pembelian_id, barang_id, harga_satuan_id,
          jumlah, nama_satuan, faktor_konversi,
          harga_satuan, subtotal, dibuat_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      for (const item of items) {
        const itemId = generateId("item");

        itemStmt.run(
          itemId,
          purchaseId,
          item.barang_id,
          item.harga_satuan_id || null,
          item.jumlah,
          item.nama_satuan,
          item.faktor_konversi || 1,
          item.harga_satuan,
          item.subtotal
        );

        // Update stock barang (add stock in base unit)
        const stockToAdd = item.jumlah * (item.faktor_konversi || 1);
        db.prepare(
          `UPDATE barang 
           SET jumlah_stok = jumlah_stok + ?,
               diperbarui_pada = datetime('now')
           WHERE id = ?`
        ).run(stockToAdd, item.barang_id);

        // Update harga_beli if harga_satuan_id exists
        if (item.harga_satuan_id) {
          db.prepare(
            `UPDATE harga_barang_satuan 
             SET harga_beli = ?,
                 diperbarui_pada = datetime('now')
             WHERE id = ?`
          ).run(item.harga_satuan, item.harga_satuan_id);
        }
      }

      // Create keuangan entry (SUPPLY category for purchases)
      const keuanganId = generateId("keu");
      const keuanganStmt = db.prepare(`
        INSERT INTO keuangan (
          id, tanggal, kategori_transaksi,
          debit, kredit, keperluan,
          biaya_bahan, catatan, dibuat_oleh,
          dibuat_pada, diperbarui_pada
        )
        VALUES (?, ?, 'SUPPLY', 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const keperluan = vendor_id
        ? `Pembelian ${nomor_pembelian}`
        : `Pembelian ${nomor_pembelian} (Tanpa Vendor)`;

      keuanganStmt.run(
        keuanganId,
        tanggal || new Date().toISOString().split("T")[0],
        total_jumlah,
        keperluan,
        total_jumlah,
        catatan || null,
        dibuat_oleh || null
      );

      db.exec("COMMIT");

      // Get created purchase with items
      const newPurchase: any = db
        .prepare(
          `SELECT p.*, v.nama_perusahaan as vendor_name 
           FROM pembelian p
           LEFT JOIN vendor v ON p.vendor_id = v.id
           WHERE p.id = ?`
        )
        .get(purchaseId);

      const newItems = db
        .prepare(
          `SELECT ip.*, b.nama as barang_name 
           FROM item_pembelian ip
           LEFT JOIN barang b ON ip.barang_id = b.id
           WHERE ip.pembelian_id = ?`
        )
        .all(purchaseId);

      db.close();

      return NextResponse.json(
        {
          message: "Pembelian berhasil ditambahkan",
          purchase: {
            ...newPurchase,
            items: newItems,
          },
        },
        { status: 201 }
      );
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error creating purchase:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create purchase" },
      { status: 500 }
    );
  }
}
