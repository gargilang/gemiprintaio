import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "spec") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all quick specs (optional category_id filter)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("category_id");

    const db = getDb();
    let quickSpecs;

    if (categoryId) {
      quickSpecs = db
        .prepare(
          `SELECT q.*, c.name as category_name 
           FROM material_quick_specs q
           LEFT JOIN material_categories c ON q.category_id = c.id
           WHERE q.category_id = ?
           ORDER BY q.spec_type, q.display_order, q.spec_value`
        )
        .all(categoryId);
    } else {
      quickSpecs = db
        .prepare(
          `SELECT q.*, c.name as category_name 
           FROM material_quick_specs q
           LEFT JOIN material_categories c ON q.category_id = c.id
           ORDER BY c.display_order, q.spec_type, q.display_order, q.spec_value`
        )
        .all();
    }

    db.close();

    return NextResponse.json({ specs: quickSpecs });
  } catch (error: any) {
    console.error("Error fetching quick specs:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch quick specs" },
      { status: 500 }
    );
  }
}

// POST new quick spec
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category_id, spec_type, spec_value, display_order } = body;

    if (!category_id || !category_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

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

    // Check if quick spec already exists
    const existing = db
      .prepare(
        "SELECT id FROM material_quick_specs WHERE category_id = ? AND spec_type = ? AND spec_value = ?"
      )
      .get(category_id, spec_type.trim(), spec_value.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("spec");
    const stmt = db.prepare(
      `INSERT INTO material_quick_specs (id, category_id, spec_type, spec_value, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(
      id,
      category_id,
      spec_type.trim(),
      spec_value.trim(),
      display_order || 0
    );

    const newQuickSpec = db
      .prepare(
        `SELECT q.*, c.name as category_name 
         FROM material_quick_specs q
         LEFT JOIN material_categories c ON q.category_id = c.id
         WHERE q.id = ?`
      )
      .get(id);

    db.close();

    return NextResponse.json(
      {
        message: "Spesifikasi cepat berhasil ditambahkan",
        quickSpec: newQuickSpec,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create quick spec" },
      { status: 500 }
    );
  }
}
