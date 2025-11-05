import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// PUT update quick spec
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await req.json();
    const { spec_type, spec_value, display_order } = body;

    if (!spec_type || !spec_type.trim()) {
      return NextResponse.json(
        { error: "Tipe spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    if (!spec_value || !spec_value.trim()) {
      return NextResponse.json(
        { error: "Nilai spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if quick spec exists
    const existing = db
      .prepare("SELECT * FROM material_quick_specs WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if duplicate exists
    const duplicate = db
      .prepare(
        "SELECT id FROM material_quick_specs WHERE category_id = ? AND spec_type = ? AND spec_value = ? AND id != ?"
      )
      .get(
        (existing as any).category_id,
        spec_type.trim(),
        spec_value.trim(),
        params.id
      );

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(
      `UPDATE material_quick_specs 
       SET spec_type = ?, spec_value = ?, display_order = ?, updated_at = datetime('now')
       WHERE id = ?`
    );

    stmt.run(
      spec_type.trim(),
      spec_value.trim(),
      display_order || 0,
      params.id
    );

    const updatedQuickSpec = db
      .prepare(
        `SELECT q.*, c.name as category_name 
         FROM material_quick_specs q
         LEFT JOIN material_categories c ON q.category_id = c.id
         WHERE q.id = ?`
      )
      .get(params.id);

    db.close();

    return NextResponse.json({
      message: "Spesifikasi cepat berhasil diupdate",
      quickSpec: updatedQuickSpec,
    });
  } catch (error: any) {
    console.error("Error updating quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update quick spec" },
      { status: 500 }
    );
  }
}

// DELETE quick spec
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDb();

    // Check if quick spec exists
    const existing = db
      .prepare("SELECT id FROM material_quick_specs WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    const stmt = db.prepare("DELETE FROM material_quick_specs WHERE id = ?");
    stmt.run(params.id);

    db.close();

    return NextResponse.json({ message: "Spesifikasi cepat berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete quick spec" },
      { status: 500 }
    );
  }
}
