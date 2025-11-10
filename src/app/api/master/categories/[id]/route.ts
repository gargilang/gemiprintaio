import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// GET single category
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDb();
    const category = db
      .prepare("SELECT * FROM kategori_barang WHERE id = ?")
      .get(params.id);

    db.close();

    if (!category) {
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ category });
  } catch (error: any) {
    console.error("Error fetching category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch category" },
      { status: 500 }
    );
  }
}

// PUT update category
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const body = await req.json();
    const { nama, butuh_spesifikasi_status, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama kategori harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if category exists
    const existing = db
      .prepare("SELECT id FROM kategori_barang WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if name is already taken by another category
    const duplicate = db
      .prepare("SELECT id FROM kategori_barang WHERE nama = ? AND id != ?")
      .get(nama.trim(), params.id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Kategori dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(
      `UPDATE kategori_barang 
       SET nama = ?, butuh_spesifikasi_status = ?, urutan_tampilan = ?, diperbarui_pada = datetime('now')
       WHERE id = ?`
    );

    stmt.run(
      nama.trim(),
      butuh_spesifikasi_status ? 1 : 0,
      urutan_tampilan || 0,
      params.id
    );

    const updatedCategory = db
      .prepare("SELECT * FROM kategori_barang WHERE id = ?")
      .get(params.id);

    db.close();

    return NextResponse.json({
      message: "Kategori berhasil diupdate",
      category: updatedCategory,
    });
  } catch (error: any) {
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update category" },
      { status: 500 }
    );
  }
}

// DELETE category
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const db = getDb();

    // Check if category exists
    const existing = db
      .prepare("SELECT id FROM kategori_barang WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if there are bahan using this category
    const materialsCount = db
      .prepare("SELECT COUNT(*) as count FROM barang WHERE kategori_id = ?")
      .get(params.id) as { count: number };

    if (materialsCount.count > 0) {
      db.close();
      return NextResponse.json(
        {
          error: `Tidak dapat menghapus kategori karena masih ada ${materialsCount.count} barang yang menggunakan kategori ini`,
        },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM kategori_barang WHERE id = ?");
    stmt.run(params.id);

    db.close();

    return NextResponse.json({ message: "Kategori berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete category" },
      { status: 500 }
    );
  }
}
