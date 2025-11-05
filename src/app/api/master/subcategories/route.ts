import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "sub") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all subcategories (optional category_id filter)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("category_id");

    const db = getDb();
    let subcategories;

    if (categoryId) {
      subcategories = db
        .prepare(
          `SELECT s.*, c.name as category_name 
           FROM material_subcategories s
           LEFT JOIN material_categories c ON s.category_id = c.id
           WHERE s.category_id = ?
           ORDER BY s.display_order, s.name`
        )
        .all(categoryId);
    } else {
      subcategories = db
        .prepare(
          `SELECT s.*, c.name as category_name 
           FROM material_subcategories s
           LEFT JOIN material_categories c ON s.category_id = c.id
           ORDER BY c.display_order, s.display_order, s.name`
        )
        .all();
    }

    db.close();

    return NextResponse.json({ subcategories });
  } catch (error: any) {
    console.error("Error fetching subcategories:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch subcategories" },
      { status: 500 }
    );
  }
}

// POST new subcategory
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category_id, name, display_order } = body;

    if (!category_id || !category_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama subkategori harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if category exists
    const category = db
      .prepare("SELECT id FROM material_categories WHERE id = ?")
      .get(category_id);

    if (!category) {
      db.close();
      return NextResponse.json(
        { error: "Kategori tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if subcategory already exists in this category
    const existing = db
      .prepare(
        "SELECT id FROM material_subcategories WHERE category_id = ? AND name = ?"
      )
      .get(category_id, name.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Subkategori dengan nama ini sudah ada dalam kategori ini" },
        { status: 400 }
      );
    }

    const id = generateId("sub");
    const stmt = db.prepare(
      `INSERT INTO material_subcategories (id, category_id, name, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(id, category_id, name.trim(), display_order || 0);

    const newSubcategory = db
      .prepare(
        `SELECT s.*, c.name as category_name 
         FROM material_subcategories s
         LEFT JOIN material_categories c ON s.category_id = c.id
         WHERE s.id = ?`
      )
      .get(id);

    db.close();

    return NextResponse.json(
      {
        message: "Subkategori berhasil ditambahkan",
        subcategory: newSubcategory,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating subcategory:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create subcategory" },
      { status: 500 }
    );
  }
}
