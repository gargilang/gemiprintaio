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
      piutang_id,
      jumlah_bayar,
      tanggal_bayar,
      metode_pembayaran,
      referensi,
      catatan,
      dibuat_oleh,
    } = body;

    // Validation
    if (!piutang_id) {
      return NextResponse.json(
        { success: false, error: "Piutang ID tidak boleh kosong" },
        { status: 400 }
      );
    }

    if (!jumlah_bayar || jumlah_bayar <= 0) {
      return NextResponse.json(
        { success: false, error: "Jumlah pembayaran harus lebih dari 0" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);
    db.exec("BEGIN TRANSACTION");

    try {
      // Get piutang info
      const piutang: any = db
        .prepare(
          `
        SELECT 
          pip.*,
          p.nomor_invoice,
          p.pelanggan_id,
          pel.nama as pelanggan_nama
        FROM piutang_penjualan pip
        JOIN penjualan p ON pip.id_penjualan = p.id
        LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
        WHERE pip.id = ?
      `
        )
        .get(piutang_id);

      if (!piutang) {
        db.close();
        return NextResponse.json(
          { success: false, error: "Piutang tidak ditemukan" },
          { status: 404 }
        );
      }

      // Validate payment amount
      if (jumlah_bayar > piutang.sisa_piutang) {
        db.close();
        return NextResponse.json(
          {
            success: false,
            error: "Jumlah pembayaran tidak boleh melebihi sisa piutang",
          },
          { status: 400 }
        );
      }

      // Create payment record
      const paymentId = generateId("piutangpay");
      const paymentStmt = db.prepare(`
        INSERT INTO pelunasan_piutang (
          id, id_piutang, tanggal_bayar, jumlah_bayar,
          metode_pembayaran, referensi, catatan, dibuat_oleh,
          dibuat_pada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      paymentStmt.run(
        paymentId,
        piutang_id,
        tanggal_bayar || getTodayJakarta(),
        jumlah_bayar,
        metode_pembayaran || "CASH",
        referensi || null,
        catatan || null,
        dibuat_oleh || null
      );

      // Update piutang_penjualan manually
      const newJumlahTerbayar = piutang.jumlah_terbayar + jumlah_bayar;
      const newSisaPiutang = piutang.sisa_piutang - jumlah_bayar;
      const newStatus =
        newSisaPiutang <= 0
          ? "LUNAS"
          : newJumlahTerbayar > 0
          ? "SEBAGIAN"
          : "AKTIF";

      db.prepare(
        `
        UPDATE piutang_penjualan 
        SET jumlah_terbayar = ?,
            sisa_piutang = ?,
            status = ?,
            diperbarui_pada = datetime('now')
        WHERE id = ?
      `
      ).run(newJumlahTerbayar, newSisaPiutang, newStatus, piutang_id);

      // Get updated piutang status
      const updatedPiutang: any = db
        .prepare(`SELECT * FROM piutang_penjualan WHERE id = ?`)
        .get(piutang_id);

      // Create keuangan entry for the payment
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
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      // Determine category: if fully paid, use LUNAS, otherwise PIUTANG
      const kategori = updatedPiutang.status === "LUNAS" ? "LUNAS" : "PIUTANG";

      // Build keperluan string
      let keperluan = `Bayar Piutang ${piutang.nomor_invoice}`;
      if (piutang.pelanggan_nama) {
        keperluan += ` - ${piutang.pelanggan_nama}`;
      }
      if (updatedPiutang.status === "LUNAS") {
        keperluan += " (LUNAS)";
      } else {
        keperluan += ` (Sisa: Rp ${updatedPiutang.sisa_piutang.toLocaleString(
          "id-ID"
        )})`;
      }
      keperluan += ` [REF:${piutang.id_penjualan}]`;

      keuanganStmt.run(
        keuanganId,
        tanggal_bayar || getTodayJakarta(),
        kategori,
        jumlah_bayar,
        keperluan,
        jumlah_bayar,
        catatan || null,
        dibuat_oleh || null,
        nextDisplayOrder
      );

      // Recalculate cashbook
      const { recalculateCashbook } = await import("@/lib/calculate-cashbook");
      await recalculateCashbook(db);

      db.exec("COMMIT");
      db.close();

      return NextResponse.json({
        success: true,
        message: "Pembayaran piutang berhasil dicatat",
        payment: {
          id: paymentId,
          jumlah_bayar,
          status_baru: updatedPiutang.status,
          sisa_piutang: updatedPiutang.sisa_piutang,
        },
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error paying receivable:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process receivable payment",
      },
      { status: 500 }
    );
  }
}
