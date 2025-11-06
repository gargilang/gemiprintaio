import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

// GET single material by ID
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();

    const material: any = db
      .prepare(
        `
        SELECT 
          m.*,
          mc.name as category_name,
          ms.name as subcategory_name
        FROM materials m
        LEFT JOIN material_categories mc ON m.category_id = mc.id
        LEFT JOIN material_subcategories ms ON m.subcategory_id = ms.id
        WHERE m.id = ?
      `
      )
      .get(params.id);

    if (!material) {
      db.close();
      return NextResponse.json(
        { error: "Material tidak ditemukan" },
        { status: 404 }
      );
    }

    const unitPrices = db
      .prepare(
        `
        SELECT * FROM material_unit_prices
        WHERE material_id = ?
        ORDER BY display_order, unit_name
      `
      )
      .all(params.id);

    db.close();

    return NextResponse.json({
      material: {
        ...material,
        unit_prices: unitPrices,
      },
    });
  } catch (error: any) {
    console.error("Error fetching material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch material" },
      { status: 500 }
    );
  }
}

// PUT update material
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
      unit_prices,
    } = body;

    const db = getDb();

    // Check if material exists
    const existing = db
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Material tidak ditemukan" },
        { status: 404 }
      );
    }

    // Update material
    const updateStmt = db.prepare(`
      UPDATE materials
      SET name = ?, description = ?, category_id = ?, subcategory_id = ?,
          base_unit = ?, specifications = ?, stock_quantity = ?,
          min_stock_level = ?, track_inventory = ?, requires_dimension = ?, 
          updated_at = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(
      name?.trim() || null,
      description?.trim() || null,
      category_id || null,
      subcategory_id || null,
      base_unit?.trim() || null,
      specifications?.trim() || null,
      stock_quantity || 0,
      min_stock_level || 0,
      track_inventory !== false ? 1 : 0,
      requires_dimension ? 1 : 0,
      params.id
    );

    // Update unit prices if provided
    if (unit_prices && Array.isArray(unit_prices)) {
      // Delete existing unit prices
      db.prepare("DELETE FROM material_unit_prices WHERE material_id = ?").run(
        params.id
      );

      // Insert new unit prices
      const unitPriceStmt = db.prepare(`
        INSERT INTO material_unit_prices (
          id, material_id, unit_name, conversion_factor,
          purchase_price, selling_price, member_price,
          is_default, display_order, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      unit_prices.forEach((up: any, index: number) => {
        const unitPriceId =
          up.id ||
          `up-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        unitPriceStmt.run(
          unitPriceId,
          params.id,
          up.unit_name,
          up.conversion_factor,
          up.purchase_price || 0,
          up.selling_price || 0,
          up.member_price || 0,
          up.is_default ? 1 : 0,
          index
        );
      });
    }

    // Get updated material
    const updatedMaterial: any = db
      .prepare("SELECT * FROM materials WHERE id = ?")
      .get(params.id);

    const updatedUnitPrices = db
      .prepare("SELECT * FROM material_unit_prices WHERE material_id = ?")
      .all(params.id);

    db.close();

    return NextResponse.json({
      message: "Material berhasil diupdate",
      material: {
        ...updatedMaterial,
        unit_prices: updatedUnitPrices,
      },
    });
  } catch (error: any) {
    console.error("Error updating material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update material" },
      { status: 500 }
    );
  }
}

// DELETE material
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();

    // Check if material exists
    const existing = db
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(params.id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Material tidak ditemukan" },
        { status: 404 }
      );
    }

    // Delete material (unit prices will be cascade deleted)
    db.prepare("DELETE FROM materials WHERE id = ?").run(params.id);

    db.close();

    return NextResponse.json({
      message: "Material berhasil dihapus",
    });
  } catch (error: any) {
    console.error("Error deleting material:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete material" },
      { status: 500 }
    );
  }
}
