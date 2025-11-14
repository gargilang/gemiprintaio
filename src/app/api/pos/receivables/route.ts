/**
 * DEPRECATED: This API route is deprecated.
 * Use pos-service.ts instead.
 * @see src/lib/services/pos-service.ts - getReceivables()
 */

import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

// GET - List all receivables
export async function GET() {
  try {
    const db = new Database(dbPath);

    const receivablesStmt = db.prepare(`
      SELECT 
        pip.id,
        pip.id_penjualan,
        pip.jumlah_piutang,
        pip.jumlah_terbayar,
        pip.sisa_piutang,
        pip.jatuh_tempo,
        pip.status,
        pip.catatan,
        pip.dibuat_pada,
        p.nomor_invoice,
        p.pelanggan_id,
        p.total_jumlah as total_penjualan,
        p.metode_pembayaran,
        pel.nama as pelanggan_nama,
        pel.telepon as pelanggan_telepon,
        pel.alamat as pelanggan_alamat
      FROM piutang_penjualan pip
      JOIN penjualan p ON pip.id_penjualan = p.id
      LEFT JOIN pelanggan pel ON p.pelanggan_id = pel.id
      WHERE pip.status IN ('AKTIF', 'SEBAGIAN')
      ORDER BY pip.dibuat_pada DESC
    `);

    const receivables = receivablesStmt.all();

    db.close();

    return NextResponse.json({
      success: true,
      receivables,
    });
  } catch (error: any) {
    console.error("Error fetching receivables:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch receivables" },
      { status: 500 }
    );
  }
}
