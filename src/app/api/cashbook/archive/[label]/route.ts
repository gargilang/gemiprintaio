import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ label: string }> }
) {
  try {
    // Next already decodes segments; keep as-is but trim whitespace for robustness
    const { label: labelParam } = await params;
    const label = labelParam?.trim();

    const db = new Database(DB_FILE);

    let cashBooks = db
      .prepare(
        `SELECT * FROM keuangan 
         WHERE label_arsip = ? 
         ORDER BY urutan_tampilan ASC, tanggal DESC, dibuat_pada DESC`
      )
      .all(label);

    // Fallback: try case-insensitive matching if exact match returns no rows
    if (!cashBooks || cashBooks.length === 0) {
      cashBooks = db
        .prepare(
          `SELECT * FROM keuangan 
           WHERE label_arsip LIKE ? 
           ORDER BY urutan_tampilan ASC, tanggal DESC, dibuat_pada DESC`
        )
        .all(label);
    }

    db.close();

    return NextResponse.json({ cashBooks });
  } catch (error: any) {
    console.error("Get archived cashbooks error:", error);
    return NextResponse.json(
      { error: "Failed to get archived cashbooks", details: error.message },
      { status: 500 }
    );
  }
}
