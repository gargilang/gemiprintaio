import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

export async function DELETE(request: NextRequest) {
  try {
    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    const result = db.prepare("DELETE FROM cash_book").run();

    db.close();

    return NextResponse.json({
      success: true,
      deleted: result.changes,
      message: `Successfully deleted ${result.changes} cash_book records`,
    });
  } catch (error: any) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete cash_book data", details: error.message },
      { status: 500 }
    );
  }
}
