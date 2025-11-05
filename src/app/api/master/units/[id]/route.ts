import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// PUT update unit
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await req.json();
    const { name, display_order } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama satuan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if unit exists
    const existing = db
      .prepare("SELECT id FROM material_units WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Satuan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if name is already taken by another unit
    const duplicate = db
      .prepare("SELECT id FROM material_units WHERE name = ? AND id != ?")
      .get(name.trim(), params.id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Satuan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(
      `UPDATE material_units 
       SET name = ?, display_order = ?, updated_at = datetime('now')
       WHERE id = ?`
    );

    stmt.run(name.trim(), display_order || 0, params.id);

    const updatedUnit = db
      .prepare("SELECT * FROM material_units WHERE id = ?")
      .get(params.id);

    db.close();

    return NextResponse.json({
      message: "Satuan berhasil diupdate",
      unit: updatedUnit,
    });
  } catch (error: any) {
    console.error("Error updating unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update unit" },
      { status: 500 }
    );
  }
}

// DELETE unit
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDb();

    // Check if unit exists
    const existing = db
      .prepare("SELECT id FROM material_units WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Satuan tidak ditemukan" },
        { status: 404 }
      );
    }

    const stmt = db.prepare("DELETE FROM material_units WHERE id = ?");
    stmt.run(params.id);

    db.close();

    return NextResponse.json({ message: "Satuan berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete unit" },
      { status: 500 }
    );
  }
}
