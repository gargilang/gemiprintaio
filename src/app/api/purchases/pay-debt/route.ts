import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";

function generateId(prefix: string = "payment") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// POST to pay debt for a purchase
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      purchase_id,
      jumlah_bayar,
      tanggal_bayar,
      metode_pembayaran,
      referensi,
      catatan,
      dibuat_oleh,
    } = body;

    if (!purchase_id) {
      return NextResponse.json(
        { error: "ID pembelian harus diisi" },
        { status: 400 }
      );
    }

    if (!jumlah_bayar || jumlah_bayar <= 0) {
      return NextResponse.json(
        { error: "Jumlah pembayaran harus lebih dari 0" },
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
          status_pembayaran, catatan
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

    // Validate payment amount
    const sisaHutang = purchase.total_jumlah - purchase.jumlah_dibayar;
    if (jumlah_bayar > sisaHutang) {
      return NextResponse.json(
        { error: "Jumlah pembayaran melebihi sisa hutang" },
        { status: 400 }
      );
    }

    // Calculate new values
    const newJumlahDibayar = purchase.jumlah_dibayar + jumlah_bayar;
    const newSisaHutang = purchase.total_jumlah - newJumlahDibayar;
    const newStatus = newSisaHutang <= 0 ? "LUNAS" : "SEBAGIAN";

    // Begin transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Get or create hutang_pembelian record
      let hutangRecord: any = db
        .prepare("SELECT * FROM hutang_pembelian WHERE id_pembelian = ?")
        .get(purchase_id);

      if (!hutangRecord) {
        // Create hutang record if doesn't exist
        const hutangId = generateId("hutang");
        db.prepare(
          `
          INSERT INTO hutang_pembelian (
            id, id_pembelian, jumlah_hutang, jumlah_terbayar, 
            sisa_hutang, status, dibuat_pada, diperbarui_pada
          )
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `
        ).run(
          hutangId,
          purchase_id,
          purchase.total_jumlah,
          0,
          purchase.total_jumlah,
          "AKTIF"
        );

        hutangRecord = db
          .prepare("SELECT * FROM hutang_pembelian WHERE id = ?")
          .get(hutangId);
      }

      // Insert pelunasan_hutang record
      const pelunasanId = generateId("pelunasan");
      db.prepare(
        `
        INSERT INTO pelunasan_hutang (
          id, id_hutang, tanggal_bayar, jumlah_bayar,
          metode_pembayaran, referensi, catatan, dibuat_oleh,
          dibuat_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `
      ).run(
        pelunasanId,
        hutangRecord.id,
        tanggal_bayar || new Date().toISOString().split("T")[0],
        jumlah_bayar,
        metode_pembayaran || "CASH",
        referensi || null,
        catatan || null,
        dibuat_oleh || null
      );

      // Update hutang_pembelian
      const newHutangStatus = newSisaHutang <= 0 ? "LUNAS" : "AKTIF";
      db.prepare(
        `
        UPDATE hutang_pembelian 
        SET jumlah_terbayar = jumlah_terbayar + ?,
            sisa_hutang = sisa_hutang - ?,
            status = ?,
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `
      ).run(jumlah_bayar, jumlah_bayar, newHutangStatus, hutangRecord.id);

      // Update pembelian
      db.prepare(
        `
        UPDATE pembelian 
        SET jumlah_dibayar = ?,
            status_pembayaran = ?,
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `
      ).run(newJumlahDibayar, newStatus, purchase_id);

      // Create keuangan entry (BIAYA/SUPPLY category)
      // Get the highest urutan_tampilan to assign next value
      const maxDisplayOrder = db
        .prepare(`SELECT MAX(urutan_tampilan) as max_order FROM keuangan`)
        .get() as any;

      const nextDisplayOrder = (maxDisplayOrder?.max_order || 0) + 1;

      const keuanganId = generateId("keu");
      const vendorInfo: any = purchase.vendor_id
        ? db
            .prepare("SELECT nama_perusahaan FROM vendor WHERE id = ?")
            .get(purchase.vendor_id)
        : null;

      const keperluan = `Pembayaran Hutang ${purchase.nomor_faktur}${
        vendorInfo ? ` - ${vendorInfo.nama_perusahaan}` : ""
      }${referensi ? ` (Ref: ${referensi})` : ""}`;

      db.prepare(
        `
        INSERT INTO keuangan (
          id, tanggal, kategori_transaksi,
          debit, kredit, keperluan,
          biaya_bahan, catatan, dibuat_oleh,
          urutan_tampilan, dibuat_pada, diperbarui_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `
      ).run(
        keuanganId,
        tanggal_bayar || new Date().toISOString().split("T")[0],
        "SUPPLY", // Use SUPPLY for payment of goods debt
        0, // debit
        jumlah_bayar, // kredit (outgoing money)
        keperluan,
        jumlah_bayar, // biaya_bahan
        catatan ||
          `Pelunasan ${newStatus === "LUNAS" ? "LUNAS" : "SEBAGIAN"} - ${
            purchase.nomor_faktur
          }`,
        dibuat_oleh || null,
        nextDisplayOrder
      );

      // Commit transaction
      db.exec("COMMIT");

      return NextResponse.json({
        message: "Pembayaran berhasil dicatat",
        status: newStatus,
        sisa_hutang: newSisaHutang,
      });
    } catch (err: any) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (error: any) {
    console.error("Error paying debt:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process payment" },
      { status: 500 }
    );
  }
}
