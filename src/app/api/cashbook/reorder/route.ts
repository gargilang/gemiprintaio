import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reorderedIds } = body;

    if (!Array.isArray(reorderedIds) || reorderedIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid reorderedIds array" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Update urutan_tampilan for each row
    const updateStmt = db.prepare(
      "UPDATE keuangan SET urutan_tampilan = ? WHERE id = ?"
    );

    reorderedIds.forEach((id, index) => {
      updateStmt.run(index, id);
    });

    // Note: We DO NOT recalculate after reorder
    // The user's request is to keep drag&drop UI but NOT recalculate
    // Calculation only based on input order (display_order), not user drag&drop
    // await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Successfully reordered (no recalculation)",
    });
  } catch (error: any) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder rows", details: error.message },
      { status: 500 }
    );
  }
}
