/**
 * DEPRECATED: Use restoreArchivedTransactions() from reports-service.ts
 * @see /src/lib/services/reports-service.ts
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

/**
 * POST /api/cashbook/archive/restore
 * Restore archived transactions back to active state
 * Body: { label: string, archived_at: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { label, archived_at } = body;

    if (!label || !archived_at) {
      return NextResponse.json(
        { error: "label and archived_at are required" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Restore transactions: set diarsipkan_pada and label_arsip back to NULL
    const result = db
      .prepare(
        `
      UPDATE keuangan 
      SET diarsipkan_pada = NULL, label_arsip = NULL
      WHERE label_arsip = ? AND diarsipkan_pada = ?
    `
      )
      .run(label, archived_at);

    db.close();

    return NextResponse.json({
      success: true,
      restored: result.changes,
      message: `Successfully restored ${result.changes} transactions from "${label}"`,
    });
  } catch (error: any) {
    console.error("Restore archive error:", error);
    return NextResponse.json(
      { error: "Failed to restore archive", details: error.message },
      { status: 500 }
    );
  }
}
