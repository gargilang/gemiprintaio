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
      .prepare("SELECT * FROM material_units ORDER BY display_order, name")
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
    const { name, display_order } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama satuan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if unit already exists
    const existing = db
      .prepare("SELECT id FROM material_units WHERE name = ?")
      .get(name.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Satuan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("unit");
    const stmt = db.prepare(
      `INSERT INTO material_units (id, name, display_order, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(id, name.trim(), display_order || 0);

    const newUnit = db
      .prepare("SELECT * FROM material_units WHERE id = ?")
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
