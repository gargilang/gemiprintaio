import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "unit") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all units
export async function GET() {
  try {
    const db = getDb();
    const units = db
      .prepare("SELECT * FROM satuan_barang ORDER BY urutan_tampilan, nama")
      .all();
    db.close();

    return NextResponse.json({ units });
  } catch (error: any) {
    console.error("Error fetching units:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch units" },
      { status: 500 }
    );
  }
}

// POST new unit
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nama, urutan_tampilan } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama satuan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if unit already exists
    const existing = db
      .prepare("SELECT id FROM satuan_barang WHERE nama = ?")
      .get(nama.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Satuan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("unit");
    const stmt = db.prepare(
      `INSERT INTO satuan_barang (id, nama, urutan_tampilan, dibuat_pada, diperbarui_pada)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(id, nama.trim(), urutan_tampilan || 0);

    const newUnit = db
      .prepare("SELECT * FROM satuan_barang WHERE id = ?")
      .get(id);

    db.close();

    return NextResponse.json(
      { message: "Satuan berhasil ditambahkan", unit: newUnit },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating unit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create unit" },
      { status: 500 }
    );
  }
}
