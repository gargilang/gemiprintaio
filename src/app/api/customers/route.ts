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

// GET all pelanggan
export async function GET(req: NextRequest) {
  try {
    const db = getDb();

    const pelanggan = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          nama,
          nama_perusahaan,
          npwp,
          email,
          telepon,
          alamat,
          member_status,
          dibuat_pada,
          diperbarui_pada
        FROM pelanggan
        ORDER BY nama_perusahaan, nama
      `
      )
      .all();

    db.close();

    return NextResponse.json({ pelanggan });
  } catch (error: any) {
    console.error("Error fetching pelanggan:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch pelanggan" },
      { status: 500 }
    );
  }
}

// POST new customer
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nama,
      email,
      telepon,
      alamat,
      nama_perusahaan,
      tipe_pelanggan,
      npwp,
      member_status,
    } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if customer with same name already exists
    const existing = db
      .prepare("SELECT id FROM pelanggan WHERE nama = ?")
      .get(nama.trim());

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
      nama_perusahaan && nama_perusahaan.trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    const stmt = db.prepare(`
      INSERT INTO pelanggan (
        id, tipe_pelanggan, nama, nama_perusahaan, npwp,
        email, telepon, alamat, member_status,
        dibuat_pada, diperbarui_pada, sync_status, sync_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'pending', NULL)
    `);

    stmt.run(
      customerId,
      customerType,
      nama.trim(),
      nama_perusahaan?.trim() || null,
      npwp?.trim() || null,
      email?.trim() || null,
      telepon?.trim() || null,
      alamat?.trim() || null,
      member_status ? 1 : 0
    );

    const newCustomer = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          nama,
          nama_perusahaan,
          npwp,
          email,
          telepon,
          alamat,
          member_status,
          dibuat_pada,
          diperbarui_pada
        FROM pelanggan WHERE id = ?
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
      nama,
      email,
      telepon,
      alamat,
      nama_perusahaan,
      tipe_pelanggan,
      npwp,
      member_status,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });
    }

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { error: "Nama pelanggan harus diisi" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if customer exists
    const existing = db
      .prepare("SELECT id FROM pelanggan WHERE id = ?")
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
      .prepare("SELECT id FROM pelanggan WHERE nama = ? AND id != ?")
      .get(nama.trim(), id);

    if (duplicate) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    // Determine tipe_pelanggan
    const customerType =
      nama_perusahaan && nama_perusahaan.trim()
        ? tipe_pelanggan || "perusahaan"
        : "perorangan";

    const stmt = db.prepare(`
      UPDATE pelanggan
      SET tipe_pelanggan = ?,
          nama = ?,
          nama_perusahaan = ?,
          npwp = ?,
          email = ?,
          telepon = ?,
          alamat = ?,
          member_status = ?,
          diperbarui_pada = datetime('now'),
          sync_status = 'pending',
          sync_at = NULL
      WHERE id = ?
    `);

    stmt.run(
      customerType,
      nama.trim(),
      nama_perusahaan?.trim() || null,
      npwp?.trim() || null,
      email?.trim() || null,
      telepon?.trim() || null,
      alamat?.trim() || null,
      member_status ? 1 : 0,
      id
    );

    const updatedCustomer = db
      .prepare(
        `
        SELECT 
          id,
          tipe_pelanggan,
          nama,
          nama_perusahaan,
          npwp,
          email,
          telepon,
          alamat,
          member_status,
          dibuat_pada,
          diperbarui_pada
        FROM pelanggan WHERE id = ?
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
      .prepare("SELECT id FROM pelanggan WHERE id = ?")
      .get(id);

    if (!existing) {
      db.close();
      return NextResponse.json(
        { error: "Pelanggan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Check if customer is used in penjualan. The penjualan table may still use the
    // English column name (customer_id) or the migrated Indonesian name
    // (pelanggan_id). Try the Indonesian column first and fall back if it
    // doesn't exist to avoid runtime errors during incremental migration.
    let usedInSales = null;
    try {
      usedInSales = db
        .prepare("SELECT id FROM penjualan WHERE pelanggan_id = ? LIMIT 1")
        .get(id);
    } catch (err) {
      // pelanggan_id doesn't exist yet; try the legacy column name
      usedInSales = db
        .prepare("SELECT id FROM penjualan WHERE customer_id = ? LIMIT 1")
        .get(id);
    }

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

    const stmt = db.prepare("DELETE FROM pelanggan WHERE id = ?");
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
