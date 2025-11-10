import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "cat") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all categories
export async function GET() {
  try {
    const db = getDb();
    const categories = db
      .prepare("SELECT * FROM kategori_barang ORDER BY urutan_tampilan, nama")
      .all();
    db.close();

    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST new category
export async function POST(req: NextRequest) {
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

    // Check if category already exists
    const existing = db
      .prepare("SELECT id FROM kategori_barang WHERE nama = ?")
      .get(nama.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Kategori dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("cat");
    const stmt = db.prepare(
      `INSERT INTO kategori_barang (id, nama, butuh_spesifikasi_status, urutan_tampilan, dibuat_pada, diperbarui_pada)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(
      id,
      nama.trim(),
      butuh_spesifikasi_status ? 1 : 0,
      urutan_tampilan || 0
    );

    const newCategory = db
      .prepare("SELECT * FROM kategori_barang WHERE id = ?")
      .get(id);

    db.close();

    return NextResponse.json(
      { message: "Kategori berhasil ditambahkan", category: newCategory },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create category" },
      { status: 500 }
    );
  }
}
