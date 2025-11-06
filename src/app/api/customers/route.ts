import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "database", "gemiprint.db");

function getDb() {
  return new Database(DB_PATH);
}

function generateId(prefix: string = "cust") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// GET all customers
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    const customers = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          name,
          company_name as company,
          tax_id,
          email,
          phone,
          address,
          is_member,
          created_at,
          updated_at
        FROM customers
        ORDER BY name
      `
      )
      .all();

    db.close();

    return NextResponse.json({ customers });
  } catch (error: any) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

// POST new customer
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      email,
      phone,
      address,
      company,
      tipe_pelanggan,
      tax_id,
      is_member,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if customer with same name already exists
    const existing = db
      .prepare("SELECT id FROM customers WHERE name = ?")
      .get(name.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    const customerId = generateId("cust");

    // Determine tipe_pelanggan
    const customerType =
      company && company.trim() ? tipe_pelanggan || "perusahaan" : "perorangan";

    const stmt = db.prepare(`
      INSERT INTO customers (
        id, tipe_pelanggan, name, company_name, tax_id,
        email, phone, address, is_member,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    stmt.run(
      customerId,
      customerType,
      name.trim(),
      company?.trim() || null,
      tax_id?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      is_member ? 1 : 0
    );

    const newCustomer = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          name,
          company_name as company,
          tax_id,
          email,
          phone,
          address,
          is_member,
          created_at,
          updated_at
        FROM customers WHERE id = ?
      `
      )
      .get(customerId);

    db.close();

    return NextResponse.json({ customer: newCustomer }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create customer" },
      { status: 500 }
    );
  }
}

// PUT update customer
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      email,
      phone,
      address,
      company,
      tipe_pelanggan,
      tax_id,
      is_member,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if customer exists
    const existing = db
      .prepare("SELECT id FROM customers WHERE id = ?")
      .get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if another customer has the same name
    const duplicate = db
      .prepare("SELECT id FROM customers WHERE name = ? AND id != ?")
      .get(name.trim(), id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    // Determine tipe_pelanggan
    const customerType =
      company && company.trim() ? tipe_pelanggan || "perusahaan" : "perorangan";

    const stmt = db.prepare(`
      UPDATE customers
      SET tipe_pelanggan = ?,
          name = ?,
          company_name = ?,
          tax_id = ?,
          email = ?,
          phone = ?,
          address = ?,
          is_member = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      customerType,
      name.trim(),
      company?.trim() || null,
      tax_id?.trim() || null,
      email?.trim() || null,
      phone?.trim() || null,
      address?.trim() || null,
      is_member ? 1 : 0,
      id
    );

    const updatedCustomer = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          name,
          company_name as company,
          tax_id,
          email,
          phone,
          address,
          is_member,
          created_at,
          updated_at
        FROM customers WHERE id = ?
      `
      )
      .get(id);

    db.close();

    return NextResponse.json({ customer: updatedCustomer });
  } catch (error: any) {
    console.error("Error updating customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update customer" },
      { status: 500 }
    );
  }
}

// DELETE customer
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    const db = getDb();

    // Check if customer exists
    const existing = db
      .prepare("SELECT id FROM customers WHERE id = ?")
      .get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if customer is used in sales
    const usedInSales = db
      .prepare("SELECT id FROM sales WHERE customer_id = ? LIMIT 1")
      .get(id);

    if (usedInSales) {
      db.close();
      return NextResponse.json(
        {
          error:
            "Pelanggan tidak dapat dihapus karena sudah memiliki transaksi penjualan",
        },
        { status: 400 }
      );
    }

    const stmt = db.prepare("DELETE FROM customers WHERE id = ?");
    stmt.run(id);

    db.close();

    return NextResponse.json({ message: "Pelanggan berhasil dihapus" });
  } catch (error: any) {
    console.error("Error deleting customer:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete customer" },
      { status: 500 }
    );
  }
}
