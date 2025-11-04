import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");
    const at = searchParams.get("at");

    if (!label || !at) {
      return NextResponse.json(
        { error: "Missing required params: label and at" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);

    // For archived transactions, sort by display_order ASC (oldest first)
    // This shows transactions in chronological order from oldest to newest
    const cashBooks = db
      .prepare(
        `SELECT * FROM cash_book 
         WHERE archived_label = ? AND archived_at = ?
         ORDER BY display_order ASC, created_at ASC`
      )
      .all(label, at);

    db.close();

    return NextResponse.json({ cashBooks });
  } catch (error: any) {
    console.error("Get archived(by-time) cashbooks error:", error);
    return NextResponse.json(
      { error: "Failed to get archived cashbooks", details: error.message },
      { status: 500 }
    );
  }
}
