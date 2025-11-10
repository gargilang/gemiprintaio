import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function DELETE(request: NextRequest) {
  try {
    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Only delete active transactions (diarsipkan_pada IS NULL)
    // This preserves archived transactions from "Tutup Buku"
    const result = db
      .prepare("DELETE FROM keuangan WHERE diarsipkan_pada IS NULL")
      .run();

    db.close();

    return NextResponse.json({
      success: true,
      deleted: result.changes,
      message: `Transaksi aktif berhasil dihapus. Data arsip tetap tersimpan.`,
    });
  } catch (error: any) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete cash_book data", details: error.message },
      { status: 500 }
    );
  }
}
