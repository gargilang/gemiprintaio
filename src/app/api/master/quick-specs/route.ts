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
          `SELECT q.*, c.nama as category_name 
           FROM spesifikasi_cepat_barang q
           LEFT JOIN kategori_barang c ON q.kategori_id = c.id
           WHERE q.kategori_id = ?
           ORDER BY q.tipe_spesifikasi, q.urutan_tampilan, q.nilai_spesifikasi`
        )
        .all(categoryId);
    } else {
      quickSpecs = db
        .prepare(
          `SELECT q.*, c.nama as category_name 
           FROM spesifikasi_cepat_barang q
           LEFT JOIN kategori_barang c ON q.kategori_id = c.id
           ORDER BY c.urutan_tampilan, q.tipe_spesifikasi, q.urutan_tampilan, q.nilai_spesifikasi`
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
    const {
      kategori_id,
      tipe_spesifikasi,
      nilai_spesifikasi,
      urutan_tampilan,
    } = body;

    if (!kategori_id || !kategori_id.trim()) {
      return NextResponse.json(
        { error: "ID kategori harus diisi" },
        { status: 400 }
      );
    }

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

    // Check if category exists
    const category = db
      .prepare("SELECT id FROM kategori_barang WHERE id = ?")
      .get(kategori_id);

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
        "SELECT id FROM spesifikasi_cepat_barang WHERE kategori_id = ? AND tipe_spesifikasi = ? AND nilai_spesifikasi = ?"
      )
      .get(kategori_id, tipe_spesifikasi.trim(), nilai_spesifikasi.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    const id = generateId("spec");
    const stmt = db.prepare(
      `INSERT INTO spesifikasi_cepat_barang (id, kategori_id, tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan, dibuat_pada, diperbarui_pada)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );

    stmt.run(
      id,
      kategori_id,
      tipe_spesifikasi.trim(),
      nilai_spesifikasi.trim(),
      urutan_tampilan || 0
    );

    const newQuickSpec = db
      .prepare(
        `SELECT q.*, c.nama as category_name 
         FROM spesifikasi_cepat_barang q
         LEFT JOIN kategori_barang c ON q.kategori_id = c.id
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
