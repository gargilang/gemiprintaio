/**
 * DEPRECATED: Use archiveCashbook(), getArchivedPeriods() from reports-service.ts
 * @see /src/lib/services/reports-service.ts
 */
import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, label } = body;

    if (!startDate || !endDate || !label) {
      return NextResponse.json(
        { error: "startDate, endDate, and label are required" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    const now = new Date().toISOString();

    // Archive transactions in the date range
    const result = db
      .prepare(
        `
      UPDATE keuangan 
      SET diarsipkan_pada = ?, label_arsip = ?
      WHERE tanggal >= ? AND tanggal <= ? AND diarsipkan_pada IS NULL
    `
      )
      .run(now, label, startDate, endDate);

    db.close();

    return NextResponse.json({
      success: true,
      archived: result.changes,
      message: `Successfully archived ${result.changes} transactions as "${label}"`,
    });
  } catch (error: any) {
    console.error("Archive error:", error);
    return NextResponse.json(
      { error: "Failed to archive transactions", details: error.message },
      { status: 500 }
    );
  }
}

// GET: Get list of archived periods
export async function GET(request: NextRequest) {
  try {
    const db = new Database(DB_FILE);

    const archives = db
      .prepare(
        `
      SELECT 
        label_arsip as archived_label,
        COUNT(*) as count,
        MIN(tanggal) as start_date,
        MAX(tanggal) as end_date,
        diarsipkan_pada as archived_at
      FROM keuangan
      WHERE diarsipkan_pada IS NOT NULL
      GROUP BY label_arsip, diarsipkan_pada
      ORDER BY diarsipkan_pada DESC
    `
      )
      .all();

    db.close();

    return NextResponse.json({ archives });
  } catch (error: any) {
    console.error("Get archives error:", error);
    return NextResponse.json(
      { error: "Failed to get archives", details: error.message },
      { status: 500 }
    );
  }
}
