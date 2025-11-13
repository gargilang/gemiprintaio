import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// GET all production orders
export async function GET() {
  try {
    const db = new Database(dbPath);

    const orders = db
      .prepare(
        `
      SELECT 
        op.*,
        p.nomor_invoice,
        pel.nama as pelanggan_nama
      FROM order_produksi op
      LEFT JOIN penjualan p ON op.penjualan_id = p.id
      LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
      ORDER BY 
        CASE op.prioritas
          WHEN 'KILAT' THEN 1
          WHEN 'NORMAL' THEN 2
        END,
        op.dibuat_pada DESC
    `
      )
      .all();

    // Get items for each order
    const ordersWithItems = orders.map((order: any) => {
      const items = db
        .prepare(
          `
        SELECT 
          ip.*,
          prof.nama_pengguna as operator_nama
        FROM item_produksi ip
        LEFT JOIN profil prof ON ip.operator_id = prof.id
        WHERE ip.order_produksi_id = ?
        ORDER BY ip.dibuat_pada
      `
        )
        .all(order.id);

      // Get finishing for each item
      const itemsWithFinishing = items.map((item: any) => {
        const finishing = db
          .prepare(
            `
          SELECT 
            fi.*,
            prof.nama_pengguna as operator_nama
          FROM item_finishing fi
          LEFT JOIN profil prof ON fi.operator_id = prof.id
          WHERE fi.item_produksi_id = ?
          ORDER BY fi.dibuat_pada
        `
          )
          .all(item.id);

        return { ...item, finishing };
      });

      return { ...order, items: itemsWithFinishing };
    });

    db.close();

    return NextResponse.json({ success: true, orders: ordersWithItems });
  } catch (error: any) {
    console.error("Error fetching production orders:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new production order
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      penjualan_id,
      items,
      prioritas,
      tanggal_deadline,
      catatan,
      dibuat_oleh,
    } = body;

    if (!penjualan_id || !items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Data tidak lengkap" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    // Generate SPK number
    const lastOrder = db
      .prepare(
        "SELECT nomor_spk FROM order_produksi ORDER BY dibuat_pada DESC LIMIT 1"
      )
      .get() as any;

    let spkNumber = "SPK-0001";
    if (lastOrder) {
      const lastNum = parseInt(lastOrder.nomor_spk.split("-")[1]);
      spkNumber = `SPK-${String(lastNum + 1).padStart(4, "0")}`;
    }

    // Get pelanggan_nama from penjualan
    const penjualan = db
      .prepare(
        `
      SELECT p.*, pel.nama as pelanggan_nama
      FROM penjualan p
      LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
      WHERE p.id = ?
    `
      )
      .get(penjualan_id) as any;

    // Create order_produksi
    const orderId = `OP-${Date.now()}`;
    db.prepare(
      `
      INSERT INTO order_produksi (
        id, penjualan_id, nomor_spk, pelanggan_nama, total_item, 
        status, prioritas, tanggal_deadline, catatan, dibuat_oleh
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      orderId,
      penjualan_id,
      spkNumber,
      penjualan?.pelanggan_nama || null,
      items.length,
      "MENUNGGU",
      prioritas || "NORMAL",
      tanggal_deadline || null,
      catatan || null,
      dibuat_oleh || null
    );

    // Create item_produksi for each item
    for (const item of items) {
      const itemId = `IP-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      db.prepare(
        `
        INSERT INTO item_produksi (
          id, order_produksi_id, item_penjualan_id, barang_nama, jumlah, nama_satuan,
          panjang, lebar, keterangan_dimensi, mesin_printing, jenis_bahan, 
          status, catatan_produksi
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        itemId,
        orderId,
        item.item_penjualan_id,
        item.barang_nama,
        item.jumlah,
        item.nama_satuan,
        item.panjang || null,
        item.lebar || null,
        item.keterangan_dimensi || null,
        item.mesin_printing || null,
        item.jenis_bahan || null,
        "MENUNGGU",
        item.catatan_produksi || null
      );

      // Create finishing items if any
      if (item.finishing && item.finishing.length > 0) {
        for (const fin of item.finishing) {
          const finId = `FIN-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          db.prepare(
            `
            INSERT INTO item_finishing (
              id, item_produksi_id, jenis_finishing, keterangan, status
            ) VALUES (?, ?, ?, ?, ?)
          `
          ).run(
            finId,
            itemId,
            fin.jenis_finishing,
            fin.keterangan || null,
            "MENUNGGU"
          );
        }
      }
    }

    db.close();

    return NextResponse.json({
      success: true,
      message: "Order produksi berhasil dibuat",
      order_id: orderId,
      nomor_spk: spkNumber,
    });
  } catch (error: any) {
    console.error("Error creating production order:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
