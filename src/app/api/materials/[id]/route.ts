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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const db = getDb();

    const material: any = db
      .prepare(
        `
        SELECT 
          m.*,
          mc.name as category_name,
          ms.name as subcategory_name
        FROM materials m
        LEFT JOIN material_categories mc ON m.kategori_id = mc.id
        LEFT JOIN material_subcategories ms ON m.subkategori_id = ms.id
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
        WHERE bahan_id = ?
        ORDER BY urutan_tampilan, nama_satuan
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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const body = await req.json();
    console.log("🔍 PUT request received - ID:", params.id);
    console.log("📦 Body received:", body);

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
      unit_prices,
    } = body;

    const db = getDb();

    // Check if material exists
    const existing = db
      .prepare("SELECT id FROM materials WHERE id = ?")
      .get(params.id);

    console.log("🔎 Material lookup result:", existing);

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
      SET nama = ?, deskripsi = ?, kategori_id = ?, subkategori_id = ?,
          satuan_dasar = ?, spesifikasi = ?, jumlah_stok = ?,
          level_stok_minimum = ?, lacak_inventori_status = ?, butuh_dimensi_status = ?, 
          diperbarui_pada = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(
      nama?.trim() || null,
      deskripsi?.trim() || null,
      kategori_id || null,
      subkategori_id || null,
      satuan_dasar?.trim() || null,
      spesifikasi?.trim() || null,
      jumlah_stok || 0,
      level_stok_minimum || 0,
      lacak_inventori_status !== false ? 1 : 0,
      butuh_dimensi_status ? 1 : 0,
      params.id
    );

    // Update unit prices if provided
    if (unit_prices && Array.isArray(unit_prices)) {
      // Delete existing unit prices
      db.prepare("DELETE FROM material_unit_prices WHERE bahan_id = ?").run(
        params.id
      );

      // Insert new unit prices
      const unitPriceStmt = db.prepare(`
        INSERT INTO material_unit_prices (
          id, bahan_id, nama_satuan, faktor_konversi,
          harga_beli, harga_jual, harga_member,
          default_status, urutan_tampilan, dibuat_pada, diperbarui_pada
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
          up.nama_satuan,
          up.faktor_konversi,
          up.harga_beli || 0,
          up.harga_jual || 0,
          up.harga_member || 0,
          up.default_status ? 1 : 0,
          index
        );
      });
    }

    // Get updated material
    const updatedMaterial: any = db
      .prepare("SELECT * FROM materials WHERE id = ?")
      .get(params.id);

    const updatedUnitPrices = db
      .prepare("SELECT * FROM material_unit_prices WHERE bahan_id = ?")
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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
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
