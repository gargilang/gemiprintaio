import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// PUT reorder categories
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { items } = body; // Array of { id, urutan_tampilan }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Items array harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Update each category's urutan_tampilan in a transaction
    const updateStmt = db.prepare(
      "UPDATE kategori_bahan SET urutan_tampilan = ?, diperbarui_pada = datetime('now') WHERE id = ?"
    );

    const transaction = db.transaction((itemsToUpdate: any[]) => {
      for (const item of itemsToUpdate) {
        updateStmt.run(item.urutan_tampilan, item.id);
      }
    });

    transaction(items);

    db.close();

    return NextResponse.json({
      message: "Urutan kategori berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error reordering categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reorder categories" },
      { status: 500 }
    );
  }
}
