import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getTodayJakarta(): string {
  return new Date().toLocaleDateString("sv-SE", {
    timeZone: "Asia/Jakarta",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      pelanggan_id,
      items, // Array of { barang_id, harga_satuan_id, jumlah, nama_satuan, faktor_konversi, harga_satuan, subtotal, panjang?, lebar? }
      total_jumlah,
      jumlah_dibayar,
      jumlah_kembalian,
      metode_pembayaran, // CASH, TRANSFER, QRIS, DEBIT, DOWN_PAYMENT, NET30
      catatan,
      kasir_id,
      tanggal, // Optional, defaults to today
    } = body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: "Items tidak boleh kosong" },
        { status: 400 }
      );
    }

    if (!total_jumlah || total_jumlah <= 0) {
      return NextResponse.json(
        { success: false, error: "Total jumlah harus lebih dari 0" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);
    db.exec("BEGIN TRANSACTION");

    try {
      const saleId = generateId("sale");
      const tanggalSale = tanggal || getTodayJakarta();

      // Generate invoice number (format: INV-YYYYMMDD-XXX)
      const dateStr = tanggalSale.replace(/-/g, "");
      const lastInvoice: any = db
        .prepare(
          `SELECT nomor_invoice FROM penjualan WHERE nomor_invoice LIKE ? ORDER BY nomor_invoice DESC LIMIT 1`
        )
        .get(`INV-${dateStr}-%`);

      let invoiceNumber: string;
      if (lastInvoice) {
        const lastNum = parseInt(lastInvoice.nomor_invoice.split("-")[2]);
        invoiceNumber = `INV-${dateStr}-${String(lastNum + 1).padStart(
          3,
          "0"
        )}`;
      } else {
        invoiceNumber = `INV-${dateStr}-001`;
      }

      // Determine payment status
      // Check if payment is sufficient for full payment methods
      const actualPaid = jumlah_dibayar || 0;
      const isFullPaymentMethod =
        metode_pembayaran === "CASH" ||
        metode_pembayaran === "TRANSFER" ||
        metode_pembayaran === "QRIS" ||
        metode_pembayaran === "DEBIT";

      const isLunas = isFullPaymentMethod && actualPaid >= total_jumlah;
      const isPiutang =
        metode_pembayaran === "DOWN_PAYMENT" ||
        metode_pembayaran === "NET30" ||
        (isFullPaymentMethod && actualPaid < total_jumlah && actualPaid > 0);

      // Create sale record
      const saleStmt = db.prepare(`
        INSERT INTO penjualan (
          id, nomor_invoice, pelanggan_id, total_jumlah,
          jumlah_dibayar, jumlah_kembalian, metode_pembayaran,
          kasir_id, catatan, dibuat_pada, diperbarui_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      saleStmt.run(
        saleId,
        invoiceNumber,
        pelanggan_id || null,
        total_jumlah,
        actualPaid,
        jumlah_kembalian || 0,
        metode_pembayaran,
        kasir_id || null,
        catatan || null
      );

      // Insert sale items and update stock
      const itemStmt = db.prepare(`
        INSERT INTO item_penjualan (
          id, penjualan_id, barang_id, harga_satuan_id,
          jumlah, nama_satuan, faktor_konversi, harga_satuan,
          subtotal, dibuat_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const updateStockStmt = db.prepare(`
        UPDATE barang
        SET jumlah_stok = jumlah_stok - ?
        WHERE id = ?
      `);

      const incrementFrequencyStmt = db.prepare(`
        UPDATE barang
        SET frekuensi_terjual = frekuensi_terjual + 1
        WHERE id = ?
      `);

      for (const item of items) {
        const itemId = generateId("saleitem");

        // For items with dimensions, jumlah is already calculated as (panjang * lebar)
        itemStmt.run(
          itemId,
          saleId,
          item.barang_id,
          item.harga_satuan_id || null,
          item.jumlah,
          item.nama_satuan,
          item.faktor_konversi,
          item.harga_satuan,
          item.subtotal
        );

        // Update stock - check if material tracks inventory
        const material: any = db
          .prepare(`SELECT lacak_inventori_status FROM barang WHERE id = ?`)
          .get(item.barang_id);

        if (material && material.lacak_inventori_status === 1) {
          // Convert to base unit for stock update
          const stockReduction = item.jumlah * item.faktor_konversi;
          updateStockStmt.run(stockReduction, item.barang_id);
        }

        // Increment frequency counter for sorting favorites
        incrementFrequencyStmt.run(item.barang_id);
      }

      // Create finance entry for LUNAS transactions
      if (isLunas) {
        const maxDisplayOrder = db
          .prepare(`SELECT MAX(urutan_tampilan) as max_order FROM keuangan`)
          .get() as any;

        const nextDisplayOrder = (maxDisplayOrder?.max_order || 0) + 1;

        const keuanganId = generateId("keu");
        const keuanganStmt = db.prepare(`
          INSERT INTO keuangan (
            id, tanggal, kategori_transaksi,
            debit, kredit, keperluan,
            omzet, catatan, dibuat_oleh,
            urutan_tampilan,
            dibuat_pada, diperbarui_pada
          )
          VALUES (?, ?, 'OMZET', ?, 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        // Get customer name if exists
        const customerInfo: any = pelanggan_id
          ? db
              .prepare("SELECT nama FROM pelanggan WHERE id = ?")
              .get(pelanggan_id)
          : null;

        // Format catatan - take first 25 chars if exists
        const catatanExcerpt =
          catatan && catatan.trim()
            ? catatan.trim().substring(0, 25) +
              (catatan.trim().length > 25 ? "..." : "")
            : null;

        // Build keperluan string
        let keperluan = `Penjualan ${invoiceNumber}`;
        if (customerInfo?.nama) {
          keperluan += ` - ${customerInfo.nama}`;
        } else {
          keperluan += " - Walk-in";
        }
        if (catatanExcerpt) {
          keperluan += ` (${catatanExcerpt})`;
        }
        keperluan += ` [REF:${saleId}]`;

        keuanganStmt.run(
          keuanganId,
          tanggalSale,
          total_jumlah,
          keperluan,
          total_jumlah,
          catatan || null,
          kasir_id || null,
          nextDisplayOrder
        );

        // Recalculate cashbook
        const { recalculateCashbook } = await import(
          "@/lib/calculate-cashbook"
        );
        await recalculateCashbook(db);
      } else if (isPiutang) {
        // Create piutang entry
        const piutangId = generateId("piutang");
        const jatuhTempo =
          metode_pembayaran === "NET30"
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            : null;

        // Calculate piutang amount
        const jumlahTerbayar = actualPaid;
        const jumlahPiutang = total_jumlah;
        const sisaPiutang = jumlahPiutang - jumlahTerbayar;

        const piutangStmt = db.prepare(`
          INSERT INTO piutang_penjualan (
            id, id_penjualan, jumlah_piutang, jumlah_terbayar,
            sisa_piutang, jatuh_tempo, status, catatan,
            dibuat_pada, diperbarui_pada
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        // Determine status and catatan
        let statusPiutang = "AKTIF";
        let catatanPiutang = "";

        if (metode_pembayaran === "NET30") {
          catatanPiutang = "Piutang dengan jatuh tempo 30 hari";
        } else if (metode_pembayaran === "DOWN_PAYMENT") {
          catatanPiutang = "Down Payment - pembayaran sebagian";
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        } else {
          // For CASH, TRANSFER, QRIS, DEBIT with partial payment
          catatanPiutang = `Pembayaran ${metode_pembayaran} tidak mencukupi`;
          if (sisaPiutang > 0 && jumlahTerbayar > 0) {
            statusPiutang = "SEBAGIAN";
          }
        }

        piutangStmt.run(
          piutangId,
          saleId,
          jumlahPiutang,
          jumlahTerbayar,
          sisaPiutang,
          jatuhTempo,
          statusPiutang,
          catatanPiutang
        );

        // If there's a partial payment (down payment or partial payment), record it in finance
        if (jumlahTerbayar > 0) {
          const maxDisplayOrder = db
            .prepare(`SELECT MAX(urutan_tampilan) as max_order FROM keuangan`)
            .get() as any;

          const nextDisplayOrder = (maxDisplayOrder?.max_order || 0) + 1;

          const keuanganId = generateId("keu");
          const keuanganStmt = db.prepare(`
            INSERT INTO keuangan (
              id, tanggal, kategori_transaksi,
              debit, kredit, keperluan,
              omzet, catatan, dibuat_oleh,
              urutan_tampilan,
              dibuat_pada, diperbarui_pada
            )
            VALUES (?, ?, 'PIUTANG', ?, 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `);

          const customerInfo: any = pelanggan_id
            ? db
                .prepare("SELECT nama FROM pelanggan WHERE id = ?")
                .get(pelanggan_id)
            : null;

          let keperluan = "";
          if (metode_pembayaran === "DOWN_PAYMENT") {
            keperluan = `DP ${invoiceNumber}`;
          } else {
            keperluan = `Pembayaran Sebagian ${invoiceNumber}`;
          }

          if (customerInfo?.nama) {
            keperluan += ` - ${customerInfo.nama}`;
          } else {
            keperluan += " - Walk-in";
          }
          keperluan += ` (Rp ${jumlahTerbayar.toLocaleString(
            "id-ID"
          )} dari Rp ${total_jumlah.toLocaleString("id-ID")})`;
          keperluan += ` [REF:${saleId}]`;

          keuanganStmt.run(
            keuanganId,
            tanggalSale,
            jumlahTerbayar,
            keperluan,
            jumlahTerbayar,
            catatan || null,
            kasir_id || null,
            nextDisplayOrder
          );

          // Recalculate cashbook
          const { recalculateCashbook } = await import(
            "@/lib/calculate-cashbook"
          );
          await recalculateCashbook(db);
        }
      }

      db.exec("COMMIT");

      // Get created sale with items
      const newSale: any = db
        .prepare(
          `
        SELECT 
          p.id,
          p.nomor_invoice,
          p.pelanggan_id,
          p.total_jumlah,
          p.jumlah_dibayar,
          p.jumlah_kembalian,
          p.metode_pembayaran,
          p.kasir_id,
          p.catatan,
          p.dibuat_pada,
          pel.nama as pelanggan_nama,
          prof.nama_pengguna as kasir_nama,
          CASE 
            WHEN pip.status IS NOT NULL THEN pip.status
            ELSE 'LUNAS'
          END as status_pembayaran,
          COALESCE(pip.sisa_piutang, 0) as sisa_piutang
        FROM penjualan p
        LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
        LEFT JOIN profil prof ON p.kasir_id = prof.id
        LEFT JOIN piutang_penjualan pip ON p.id = pip.id_penjualan
        WHERE p.id = ?
      `
        )
        .get(saleId);

      const saleItems = db
        .prepare(
          `
        SELECT 
          ip.id,
          ip.penjualan_id,
          ip.barang_id,
          ip.jumlah,
          ip.nama_satuan,
          ip.harga_satuan,
          ip.subtotal,
          b.nama as barang_nama
        FROM item_penjualan ip
        LEFT JOIN barang b ON ip.barang_id = b.id
        WHERE ip.penjualan_id = ?
      `
        )
        .all(saleId);

      db.close();

      return NextResponse.json({
        success: true,
        sale: {
          ...newSale,
          items: saleItems,
        },
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error creating sale:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create sale" },
      { status: 500 }
    );
  }
}
