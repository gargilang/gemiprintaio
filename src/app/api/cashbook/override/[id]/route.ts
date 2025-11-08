import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Build dynamic UPDATE query based on provided fields
    const updates: string[] = [];
    const values: any[] = [];

    // Editable fields with their override flags
    const editableFields = [
      "saldo",
      "omzet",
      "biaya_operasional",
      "biaya_bahan",
      "laba_bersih",
      "kasbon_anwar",
      "kasbon_suri",
      "kasbon_cahaya",
      "kasbon_dinil",
      "bagi_hasil_anwar",
      "bagi_hasil_suri",
      "bagi_hasil_gemi",
    ];

    for (const field of editableFields) {
      if (field in body && body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
        // Set override flag
        updates.push(`override_${field} = ?`);
        values.push(1);
      }
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    values.push(id);

    const query = `UPDATE keuangan SET ${updates.join(", ")} WHERE id = ?`;
    console.log("Override Query:", query);
    console.log("Override Values:", values);
    console.log("Override ID:", id);

    const result = db.prepare(query).run(...values);
    console.log("Override Result:", result);

    if (result.changes === 0) {
      db.close();
      return NextResponse.json(
        { error: "Keuangan entry not found", id, query },
        { status: 404 }
      );
    }

    // Recalculate subsequent rows using centralized function
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Successfully updated cash book entry with manual override",
    });
  } catch (error: any) {
    console.error("Override error:", error);
    return NextResponse.json(
      { error: "Failed to update cash book entry", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const field = url.searchParams.get("field");

    if (!field) {
      return NextResponse.json(
        { error: "Field parameter is required" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Remove override flag
    const query = `UPDATE keuangan SET override_${field} = 0 WHERE id = ?`;
    const result = db.prepare(query).run(id);

    if (result.changes === 0) {
      db.close();
      return NextResponse.json(
        { error: "Keuangan entry not found" },
        { status: 404 }
      );
    }

    // Recalculate all rows using centralized function
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      message: `Successfully removed override for ${field}`,
    });
  } catch (error: any) {
    console.error("Remove override error:", error);
    return NextResponse.json(
      { error: "Failed to remove override", details: error.message },
      { status: 500 }
    );
  }
}
