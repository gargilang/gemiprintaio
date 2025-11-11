import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import { getTodayJakarta } from "@/lib/date-utils";

function generateId(prefix: string = "purchase") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all purchases with details
export async function GET(req: NextRequest) {
  try {
    const db = await getDatabaseAsync();

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
      nomor_faktur,
      vendor_id,
      tanggal,
      metode_pembayaran,
      catatan,
      items, // Array of purchase items
      dibuat_oleh,
    } = body;

    if (!nomor_faktur || !nomor_faktur.trim()) {
      return NextResponse.json(
        { error: "Nomor faktur harus diisi" },
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

    const db = await getDatabaseAsync();

    // Check if nomor_faktur already exists
    const existing = db
      .prepare("SELECT id FROM pembelian WHERE nomor_faktur = ?")
      .get(nomor_faktur.trim());

    if (existing) {
      return NextResponse.json(
        { error: "Nomor faktur sudah digunakan" },
        { status: 400 }
      );
    }

    const purchaseId = generateId("purchase");
    const metodePembayaran = metode_pembayaran || "CASH";
    const isLunas = metodePembayaran === "CASH";
    const statusPembayaran = isLunas ? "LUNAS" : "HUTANG";
    const jumlahDibayar = isLunas ? total_jumlah : 0;

    // Generate nomor_pembelian (auto-increment style)
    const lastPurchase: any = db
      .prepare(
        "SELECT nomor_pembelian FROM pembelian ORDER BY dibuat_pada DESC LIMIT 1"
      )
      .get();

    let nextNumber = 1;
    if (lastPurchase && lastPurchase.nomor_pembelian) {
      const match = lastPurchase.nomor_pembelian.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }
    const nomorPembelian = `PO-${nextNumber.toString().padStart(5, "0")}`;

    // Begin transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Insert purchase
      const purchaseStmt = db.prepare(`
        INSERT INTO pembelian (
          id, nomor_pembelian, nomor_faktur, tanggal, vendor_id, total_jumlah,
          jumlah_dibayar, metode_pembayaran, status_pembayaran, catatan,
          dibuat_oleh, dibuat_pada, diperbarui_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      purchaseStmt.run(
        purchaseId,
        nomorPembelian,
        nomor_faktur.trim(),
        tanggal || getTodayJakarta(),
        vendor_id || null,
        total_jumlah,
        jumlahDibayar,
        metodePembayaran,
        statusPembayaran,
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

        // Update harga_beli for ALL unit prices based on the purchased unit's price
        if (item.harga_satuan_id && item.faktor_konversi) {
          // Calculate price per base unit (e.g., price per lembar)
          const pricePerBaseUnit = item.harga_satuan / item.faktor_konversi;

          // Get all unit prices for this material
          const allUnitPrices = db
            .prepare(
              `SELECT id, faktor_konversi FROM harga_barang_satuan WHERE barang_id = ?`
            )
            .all(item.barang_id);

          // Update each unit price proportionally
          const updatePriceStmt = db.prepare(
            `UPDATE harga_barang_satuan 
             SET harga_beli = ?,
                 diperbarui_pada = datetime('now')
             WHERE id = ?`
          );

          allUnitPrices.forEach((unitPrice: any) => {
            const newPrice = pricePerBaseUnit * unitPrice.faktor_konversi;
            updatePriceStmt.run(newPrice, unitPrice.id);
          });
        }
      }

      // Only create keuangan entry if CASH (LUNAS)
      if (isLunas) {
        // Get the highest urutan_tampilan to assign next value
        const maxDisplayOrder = db
          .prepare(`SELECT MAX(urutan_tampilan) as max_order FROM keuangan`)
          .get() as any;

        const nextDisplayOrder = (maxDisplayOrder?.max_order || 0) + 1;

        const keuanganId = generateId("keu");
        const keuanganStmt = db.prepare(`
          INSERT INTO keuangan (
            id, tanggal, kategori_transaksi,
            debit, kredit, keperluan,
            biaya_bahan, catatan, dibuat_oleh,
            urutan_tampilan,
            dibuat_pada, diperbarui_pada
          )
          VALUES (?, ?, 'SUPPLY', 0, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        const keperluan = vendor_id
          ? `Pembelian ${nomorPembelian} (${nomor_faktur})`
          : `Pembelian ${nomorPembelian} (${nomor_faktur}) - Tanpa Vendor`;

        keuanganStmt.run(
          keuanganId,
          tanggal || getTodayJakarta(),
          total_jumlah,
          keperluan,
          total_jumlah,
          catatan || null,
          dibuat_oleh || null,
          nextDisplayOrder
        );
      } else {
        // Create hutang entry for NET30 or COD
        const hutangId = generateId("hutang");
        const jatuhTempo =
          metodePembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        const hutangStmt = db.prepare(`
          INSERT INTO hutang_pembelian (
            id, id_pembelian, jumlah_hutang, jumlah_terbayar,
            sisa_hutang, jatuh_tempo, status, catatan,
            dibuat_pada, diperbarui_pada
          )
          VALUES (?, ?, ?, 0, ?, ?, 'AKTIF', ?, datetime('now'), datetime('now'))
        `);

        hutangStmt.run(
          hutangId,
          purchaseId,
          total_jumlah,
          total_jumlah,
          jatuhTempo,
          metodePembayaran === "NET30"
            ? `Hutang dengan jatuh tempo 30 hari`
            : `Hutang COD - bayar saat terima barang`
        );
      }

      // Recalculate cashbook if keuangan entry was created
      if (isLunas) {
        const { recalculateCashbook } = await import(
          "@/lib/calculate-cashbook"
        );
        await recalculateCashbook(db);
      }

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
