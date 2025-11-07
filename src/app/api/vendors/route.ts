import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "vendor") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all vendor
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    const vendor = db
      .prepare(
        `
        SELECT 
          id,
          nama_perusahaan,
          email,
          telepon,
          alamat,
          kontak_person,
          ketentuan_bayar,
          aktif_status,
          catatan,
          dibuat_pada,
          diperbarui_pada
        FROM vendor
        ORDER BY nama_perusahaan
      `
      )
      .all();

    db.close();

    return NextResponse.json({ vendor });
  } catch (error: any) {
    console.error("Error fetching vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch vendor" },
      { status: 500 }
    );
  }
}

// POST new vendor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nama_perusahaan,
      email,
      telepon,
      alamat,
      kontak_person,
      ketentuan_bayar,
      aktif_status,
      catatan,
    } = body;

    if (!nama_perusahaan || !nama_perusahaan.trim()) {
      return NextResponse.json(
        { error: "Nama perusahaan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if vendor with same company name already exists
    const existing = db
      .prepare("SELECT id FROM vendor WHERE nama_perusahaan = ?")
      .get(nama_perusahaan.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor dengan nama perusahaan ini sudah ada" },
        { status: 400 }
      );
    }

    const vendorId = generateId("vendor");

    const stmt = db.prepare(`
      INSERT INTO vendor (
        id, nama_perusahaan, email, telepon, alamat,
        kontak_person, ketentuan_bayar, aktif_status, catatan,
        dibuat_pada, diperbarui_pada
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
      vendorId,
      nama_perusahaan.trim(),
      email?.trim() || null,
      telepon?.trim() || null,
      alamat?.trim() || null,
      kontak_person?.trim() || null,
      ketentuan_bayar?.trim() || null,
      aktif_status !== undefined ? (aktif_status ? 1 : 0) : 1,
      catatan?.trim() || null
    );

    const newVendor = db
      .prepare(
        `
        SELECT 
          id,
          nama_perusahaan,
          email,
          telepon,
          alamat,
          kontak_person,
          ketentuan_bayar,
          aktif_status,
          catatan,
          dibuat_pada,
          diperbarui_pada
        FROM vendor WHERE id = ?
      `
      )
      .get(vendorId);

    db.close();

    return NextResponse.json({ vendor: newVendor }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create vendor" },
      { status: 500 }
    );
  }
}

// PUT update vendor
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      nama_perusahaan,
      email,
      telepon,
      alamat,
      kontak_person,
      ketentuan_bayar,
      aktif_status,
      catatan,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!nama_perusahaan || !nama_perusahaan.trim()) {
      return NextResponse.json(
        { error: "Nama perusahaan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if vendor exists
    const existing = db.prepare("SELECT id FROM vendor WHERE id = ?").get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if another vendor has the same company name
    const duplicate = db
      .prepare("SELECT id FROM vendor WHERE nama_perusahaan = ? AND id != ?")
      .get(nama_perusahaan.trim(), id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Vendor dengan nama perusahaan ini sudah ada" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(`
      UPDATE vendor
      SET nama_perusahaan = ?,
          email = ?,
          telepon = ?,
          alamat = ?,
          kontak_person = ?,
          ketentuan_bayar = ?,
          aktif_status = ?,
          catatan = ?,
          diperbarui_pada = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      nama_perusahaan.trim(),
      email?.trim() || null,
      telepon?.trim() || null,
      alamat?.trim() || null,
      kontak_person?.trim() || null,
      ketentuan_bayar?.trim() || null,
      aktif_status !== undefined ? (aktif_status ? 1 : 0) : 1,
      catatan?.trim() || null,
      id
    );

    const updatedVendor = db
      .prepare(
        `
        SELECT 
          id,
          nama_perusahaan,
          email,
          telepon,
          alamat,
          kontak_person,
          ketentuan_bayar,
          aktif_status,
          catatan,
          dibuat_pada,
          diperbarui_pada
        FROM vendor WHERE id = ?
      `
      )
      .get(id);

    db.close();

    return NextResponse.json({ vendor: updatedVendor });
  } catch (error: any) {
    console.error("Error updating vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update vendor" },
      { status: 500 }
    );
  }
}

// DELETE vendor
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    const db = getDb();

    // Check if vendor exists
    const existing = db.prepare("SELECT id FROM vendor WHERE id = ?").get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if vendor is used in pembelian
    const usedInPurchases = db
      .prepare("SELECT id FROM pembelian WHERE vendor_id = ? LIMIT 1")
      .get(id);

    if (usedInPurchases) {
      db.close();
      return NextResponse.json(
        {
          error:
            "Vendor tidak dapat dihapus karena sudah memiliki transaksi pembelian",
        },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM vendor WHERE id = ?");
    stmt.run(id);

    db.close();

    return NextResponse.json({ message: "Vendor berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete vendor" },
      { status: 500 }
    );
  }
}
