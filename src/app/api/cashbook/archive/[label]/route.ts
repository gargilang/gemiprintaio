import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function GET(
  request: NextRequest,
  { params }: { params: { label: string } }
) {
  try {
    // Next already decodes segments; keep as-is but trim whitespace for robustness
    const label = params.label?.trim();

    const db = new Database(DB_FILE);

    let cashBooks = db
      .prepare(
        `SELECT * FROM cash_book 
         WHERE archived_label = ? 
         ORDER BY display_order ASC, tanggal DESC, created_at DESC`
      )
      .all(label);

    // Fallback: try case-insensitive matching if exact match returns no rows
    if (!cashBooks || cashBooks.length === 0) {
      cashBooks = db
        .prepare(
          `SELECT * FROM cash_book 
           WHERE archived_label LIKE ? 
           ORDER BY display_order ASC, tanggal DESC, created_at DESC`
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
