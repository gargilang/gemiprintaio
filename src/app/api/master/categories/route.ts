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
      .prepare("SELECT * FROM material_categories ORDER BY display_order, name")
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
    const { name, needs_specifications, display_order } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama kategori harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if category already exists
    const existing = db
      .prepare("SELECT id FROM material_categories WHERE name = ?")
      .get(name.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Kategori dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("cat");
    const stmt = db.prepare(
      `INSERT INTO material_categories (id, name, needs_specifications, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(id, name.trim(), needs_specifications ? 1 : 0, display_order || 0);

    const newCategory = db
      .prepare("SELECT * FROM material_categories WHERE id = ?")
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
