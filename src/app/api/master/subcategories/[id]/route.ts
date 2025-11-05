import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// PUT update subcategory
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
        { error: "Nama subkategori harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if subcategory exists
    const existing = db
      .prepare("SELECT * FROM material_subcategories WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Subkategori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if name is already taken by another subcategory in the same category
    const duplicate = db
      .prepare(
        "SELECT id FROM material_subcategories WHERE category_id = ? AND name = ? AND id != ?"
      )
      .get((existing as any).category_id, name.trim(), params.id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Subkategori dengan nama ini sudah ada dalam kategori ini" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(
      `UPDATE material_subcategories 
       SET name = ?, display_order = ?, updated_at = datetime('now')
       WHERE id = ?`
    );

    stmt.run(name.trim(), display_order || 0, params.id);

    const updatedSubcategory = db
      .prepare(
        `SELECT s.*, c.name as category_name 
         FROM material_subcategories s
         LEFT JOIN material_categories c ON s.category_id = c.id
         WHERE s.id = ?`
      )
      .get(params.id);

    db.close();

    return NextResponse.json({
      message: "Subkategori berhasil diupdate",
      subcategory: updatedSubcategory,
    });
  } catch (error: any) {
    console.error("Error updating subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update subcategory" },
      { status: 500 }
    );
  }
}

// DELETE subcategory
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDb();

    // Check if subcategory exists
    const existing = db
      .prepare("SELECT id FROM material_subcategories WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Subkategori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if there are materials using this subcategory
    const materialsCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM materials WHERE subcategory_id = ?"
      )
      .get(params.id) as { count: number };

    if (materialsCount.count > 0) {
      db.close();
      return NextResponse.json(
        {
          error: `Tidak dapat menghapus subkategori karena masih ada ${materialsCount.count} bahan yang menggunakan subkategori ini`,
        },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM material_subcategories WHERE id = ?");
    stmt.run(params.id);

    db.close();

    return NextResponse.json({ message: "Subkategori berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete subcategory" },
      { status: 500 }
    );
  }
}
