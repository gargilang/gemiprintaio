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

// GET all materials with their unit prices
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    // Get all materials
    const materials = db
      .prepare(
        `
        SELECT 
          m.*,
          mc.name as category_name,
          ms.name as subcategory_name
        FROM materials m
        LEFT JOIN material_categories mc ON m.category_id = mc.id
        LEFT JOIN material_subcategories ms ON m.subcategory_id = ms.id
        ORDER BY m.name
      `
      )
      .all();

    // Get unit prices for each material
    const materialsWithUnits = materials.map((material: any) => {
      const unitPrices = db
        .prepare(
          `
          SELECT * FROM material_unit_prices
          WHERE material_id = ?
          ORDER BY display_order, unit_name
        `
        )
        .all(material.id);

      return {
        ...material,
        unit_prices: unitPrices,
      };
    });

    db.close();

    return NextResponse.json({ materials: materialsWithUnits });
  } catch (error: any) {
    console.error("Error fetching materials:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch materials" },
      { status: 500 }
    );
  }
}

// POST new material with unit prices
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      category_id,
      subcategory_id,
      base_unit,
      specifications,
      stock_quantity,
      min_stock_level,
      track_inventory,
      requires_dimension,
      unit_prices, // Array of unit price objects
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama bahan harus diisi" },
        { status: 400 }
      );
    }

    if (!base_unit || !base_unit.trim()) {
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
      .prepare("SELECT id FROM materials WHERE name = ?")
      .get(name.trim());

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
      INSERT INTO materials (
        id, name, description, category_id, subcategory_id,
        base_unit, specifications, stock_quantity, min_stock_level,
        track_inventory, requires_dimension, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    materialStmt.run(
      materialId,
      name.trim(),
      description?.trim() || null,
      category_id || null,
      subcategory_id || null,
      base_unit.trim(),
      specifications?.trim() || null,
      stock_quantity || 0,
      min_stock_level || 0,
      track_inventory !== false ? 1 : 0,
      requires_dimension ? 1 : 0
    );

    // Insert unit prices
    const unitPriceStmt = db.prepare(`
      INSERT INTO material_unit_prices (
        id, material_id, unit_name, conversion_factor,
        purchase_price, selling_price, member_price,
        is_default, display_order, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    unit_prices.forEach((up: any, index: number) => {
      const unitPriceId = generateId("up");
      unitPriceStmt.run(
        unitPriceId,
        materialId,
        up.unit_name,
        up.conversion_factor,
        up.purchase_price || 0,
        up.selling_price || 0,
        up.member_price || 0,
        up.is_default ? 1 : 0,
        index
      );
    });

    // Get the created material with unit prices
    const newMaterial: any = db
      .prepare("SELECT * FROM materials WHERE id = ?")
      .get(materialId);

    const newUnitPrices = db
      .prepare("SELECT * FROM material_unit_prices WHERE material_id = ?")
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
