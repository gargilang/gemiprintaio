import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "mat") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all bahan with their unit prices
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    // Get all bahan
    const bahan = db
      .prepare(
        `
        SELECT 
          m.*,
          mc.nama as category_name,
          ms.nama as subcategory_name
        FROM bahan m
        LEFT JOIN kategori_bahan mc ON m.kategori_id = mc.id
        LEFT JOIN subkategori_bahan ms ON m.subkategori_id = ms.id
        ORDER BY m.nama
      `
      )
      .all();

    // Get unit prices for each material
    const materialsWithUnits = bahan.map((material: any) => {
      const unitPrices = db
        .prepare(
          `
          SELECT * FROM harga_bahan_satuan
          WHERE bahan_id = ?
          ORDER BY urutan_tampilan, nama_satuan
        `
        )
        .all(material.id);

      return {
        ...material,
        unit_prices: unitPrices,
      };
    });

    db.close();

    return NextResponse.json({ bahan: materialsWithUnits });
  } catch (error: any) {
    console.error("Error fetching bahan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch bahan" },
      { status: 500 }
    );
  }
}

// POST new material with unit prices
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nama,
      deskripsi,
      kategori_id,
      subkategori_id,
      satuan_dasar,
      spesifikasi,
      jumlah_stok,
      level_stok_minimum,
      lacak_inventori_status,
      butuh_dimensi_status,
      unit_prices, // Array of unit price objects
    } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama bahan harus diisi" },
        { status: 400 }
      );
    }

    if (!satuan_dasar || !satuan_dasar.trim()) {
      return NextResponse.json(
        { error: "Satuan dasar harus diisi" },
        { status: 400 }
      );
    }

    if (!unit_prices || unit_prices.length === 0) {
      return NextResponse.json(
        { error: "Minimal harus ada 1 harga satuan" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if material already exists
    const existing = db
      .prepare("SELECT id FROM bahan WHERE nama = ?")
      .get(nama.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Bahan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const materialId = generateId("mat");

    // Insert material
    const materialStmt = db.prepare(`
      INSERT INTO bahan (
        id, nama, deskripsi, kategori_id, subkategori_id,
        satuan_dasar, spesifikasi, jumlah_stok, level_stok_minimum,
        lacak_inventori_status, butuh_dimensi_status, dibuat_pada, diperbarui_pada
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    materialStmt.run(
      materialId,
      nama.trim(),
      deskripsi?.trim() || null,
      kategori_id || null,
      subkategori_id || null,
      satuan_dasar.trim(),
      spesifikasi?.trim() || null,
      jumlah_stok || 0,
      level_stok_minimum || 0,
      lacak_inventori_status !== false ? 1 : 0,
      butuh_dimensi_status ? 1 : 0
    );

    // Insert unit prices
    const unitPriceStmt = db.prepare(`
      INSERT INTO harga_bahan_satuan (
        id, bahan_id, nama_satuan, faktor_konversi,
        harga_beli, harga_jual, harga_member,
        default_status, urutan_tampilan, dibuat_pada, diperbarui_pada
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    unit_prices.forEach((up: any, index: number) => {
      const unitPriceId = generateId("up");
      unitPriceStmt.run(
        unitPriceId,
        materialId,
        up.nama_satuan,
        up.faktor_konversi,
        up.harga_beli || 0,
        up.harga_jual || 0,
        up.harga_member || 0,
        up.default_status ? 1 : 0,
        index
      );
    });

    // Get the created material with unit prices
    const newMaterial: any = db
      .prepare("SELECT * FROM bahan WHERE id = ?")
      .get(materialId);

    const newUnitPrices = db
      .prepare("SELECT * FROM harga_bahan_satuan WHERE bahan_id = ?")
      .all(materialId);

    db.close();

    return NextResponse.json(
      {
        message: "Bahan berhasil ditambahkan",
        material: {
          ...newMaterial,
          unit_prices: newUnitPrices,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create material" },
      { status: 500 }
    );
  }
}
