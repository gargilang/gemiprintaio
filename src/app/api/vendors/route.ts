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

// GET all vendors
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    const vendors = db
      .prepare(
        `
        SELECT 
          id,
          name,
          company_name,
          email,
          phone,
          address,
          contact_person,
          payment_terms,
          is_active,
          notes,
          created_at,
          updated_at
        FROM vendors
        ORDER BY name
      `
      )
      .all();

    db.close();

    return NextResponse.json({ vendors });
  } catch (error: any) {
    console.error("Error fetching vendors:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch vendors" },
      { status: 500 }
    );
  }
}

// POST new vendor
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      company_name,
      email,
      phone,
      address,
      contact_person,
      payment_terms,
      is_active,
      notes,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama vendor harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if vendor with same name already exists
    const existing = db
      .prepare("SELECT id FROM vendors WHERE name = ?")
      .get(name.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const vendorId = generateId("vendor");

    const stmt = db.prepare(`
      INSERT INTO vendors (
        id, name, company_name, email, phone, address,
        contact_person, payment_terms, is_active, notes,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
      vendorId,
      name.trim(),
      company_name?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      contact_person?.trim() || null,
      payment_terms?.trim() || null,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      notes?.trim() || null
    );

    const newVendor = db
      .prepare(
        `
        SELECT 
          id,
          name,
          company_name,
          email,
          phone,
          address,
          contact_person,
          payment_terms,
          is_active,
          notes,
          created_at,
          updated_at
        FROM vendors WHERE id = ?
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
      name,
      company_name,
      email,
      phone,
      address,
      contact_person,
      payment_terms,
      is_active,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama vendor harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if vendor exists
    const existing = db.prepare("SELECT id FROM vendors WHERE id = ?").get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if another vendor has the same name
    const duplicate = db
      .prepare("SELECT id FROM vendors WHERE name = ? AND id != ?")
      .get(name.trim(), id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Vendor dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const stmt = db.prepare(`
      UPDATE vendors
      SET name = ?,
          company_name = ?,
          email = ?,
          phone = ?,
          address = ?,
          contact_person = ?,
          payment_terms = ?,
          is_active = ?,
          notes = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      name.trim(),
      company_name?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      contact_person?.trim() || null,
      payment_terms?.trim() || null,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      notes?.trim() || null,
      id
    );

    const updatedVendor = db
      .prepare(
        `
        SELECT 
          id,
          name,
          company_name,
          email,
          phone,
          address,
          contact_person,
          payment_terms,
          is_active,
          notes,
          created_at,
          updated_at
        FROM vendors WHERE id = ?
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
    const existing = db.prepare("SELECT id FROM vendors WHERE id = ?").get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Vendor tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if vendor is used in purchases
    const usedInPurchases = db
      .prepare("SELECT id FROM purchases WHERE vendor_id = ? LIMIT 1")
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

    const stmt = db.prepare("DELETE FROM vendors WHERE id = ?");
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
