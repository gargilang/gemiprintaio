/**
 * DEPRECATED: Use finishing-options-service.ts functions
 * @see /src/lib/services/finishing-options-service.ts
 */
import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "database", "gemiprint.db");

function generateId(prefix: string = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// GET all finishing options (including inactive)
export async function GET() {
  try {
    const db = new Database(dbPath);

    const options = db
      .prepare(
        `SELECT id, nama, urutan_tampilan, aktif_status, dibuat_pada, diperbarui_pada
         FROM opsi_finishing 
         ORDER BY urutan_tampilan ASC, nama ASC`
      )
      .all();

    db.close();

    return NextResponse.json({
      success: true,
      options,
    });
  } catch (error: any) {
    console.error("Error fetching finishing options:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch finishing options",
      },
      { status: 500 }
    );
  }
}

// POST - Add new finishing option
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nama } = body;

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { success: false, error: "Nama opsi tidak boleh kosong" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    // Check if nama already exists
    const existing = db
      .prepare("SELECT id FROM opsi_finishing WHERE nama = ?")
      .get(nama.trim());

    if (existing) {
      db.close();
      return NextResponse.json(
        { success: false, error: "Opsi dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    // Get max urutan_tampilan
    const maxOrder: any = db
      .prepare("SELECT MAX(urutan_tampilan) as max_order FROM opsi_finishing")
      .get();

    const newOrder = (maxOrder?.max_order || 0) + 1;
    const id = generateId("FIN-OPT");

    db.prepare(
      `INSERT INTO opsi_finishing (id, nama, urutan_tampilan, aktif_status)
       VALUES (?, ?, ?, 1)`
    ).run(id, nama.trim(), newOrder);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil ditambahkan",
    });
  } catch (error: any) {
    console.error("Error creating finishing option:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create finishing option",
      },
      { status: 500 }
    );
  }
}

// PUT - Update finishing option name
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, nama } = body;

    if (!id || !nama || !nama.trim()) {
      return NextResponse.json(
        { success: false, error: "ID dan nama tidak boleh kosong" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    // Check if nama already exists (excluding current)
    const existing = db
      .prepare("SELECT id FROM opsi_finishing WHERE nama = ? AND id != ?")
      .get(nama.trim(), id);

    if (existing) {
      db.close();
      return NextResponse.json(
        { success: false, error: "Opsi dengan nama ini sudah ada" },
        { status: 400 }
      );
    }

    db.prepare(
      `UPDATE opsi_finishing 
       SET nama = ?, diperbarui_pada = datetime('now')
       WHERE id = ?`
    ).run(nama.trim(), id);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil diperbarui",
    });
  } catch (error: any) {
    console.error("Error updating finishing option:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update finishing option",
      },
      { status: 500 }
    );
  }
}

// DELETE - Soft delete finishing option
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID tidak boleh kosong" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    // Soft delete by setting aktif_status to 0
    db.prepare(
      `UPDATE opsi_finishing 
       SET aktif_status = 0, diperbarui_pada = datetime('now')
       WHERE id = ?`
    ).run(id);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Opsi finishing berhasil dihapus",
    });
  } catch (error: any) {
    console.error("Error deleting finishing option:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete finishing option",
      },
      { status: 500 }
    );
  }
}

// PATCH - Update order (reorder)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { success: false, error: "Updates array tidak valid" },
        { status: 400 }
      );
    }

    const db = new Database(dbPath);

    db.exec("BEGIN TRANSACTION");

    try {
      const stmt = db.prepare(
        `UPDATE opsi_finishing 
         SET urutan_tampilan = ?, diperbarui_pada = datetime('now')
         WHERE id = ?`
      );

      for (const update of updates) {
        stmt.run(update.urutan_tampilan, update.id);
      }

      db.exec("COMMIT");
      db.close();

      return NextResponse.json({
        success: true,
        message: "Urutan berhasil diperbarui",
      });
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error: any) {
    console.error("Error updating finishing option order:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update order",
      },
      { status: 500 }
    );
  }
}
