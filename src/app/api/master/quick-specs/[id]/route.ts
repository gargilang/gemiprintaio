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
    const { tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan } = body;

    if (!tipe_spesifikasi || !tipe_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Tipe spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    if (!nilai_spesifikasi || !nilai_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Nilai spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if quick spec exists
    const existing = db
      .prepare("SELECT * FROM spesifikasi_cepat_barang WHERE id = ?")
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
        "SELECT id FROM spesifikasi_cepat_barang WHERE kategori_id = ? AND tipe_spesifikasi = ? AND nilai_spesifikasi = ? AND id != ?"
      )
      .get(
        (existing as any).kategori_id,
        tipe_spesifikasi.trim(),
        nilai_spesifikasi.trim(),
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
      `UPDATE spesifikasi_cepat_barang 
       SET tipe_spesifikasi = ?, nilai_spesifikasi = ?, urutan_tampilan = ?, diperbarui_pada = datetime('now')
       WHERE id = ?`
    );

    stmt.run(
      tipe_spesifikasi.trim(),
      nilai_spesifikasi.trim(),
      urutan_tampilan || 0,
      params.id
    );

    const updatedQuickSpec = db
      .prepare(
        `SELECT q.*, c.nama as category_name 
         FROM spesifikasi_cepat_barang q
         LEFT JOIN kategori_barang c ON q.kategori_id = c.id
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
      .prepare("SELECT id FROM spesifikasi_cepat_barang WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    const stmt = db.prepare("DELETE FROM spesifikasi_cepat_barang WHERE id = ?");
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
