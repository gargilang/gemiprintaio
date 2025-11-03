import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

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

    const query = `UPDATE cash_book SET ${updates.join(", ")} WHERE id = ?`;
    console.log("Override Query:", query);
    console.log("Override Values:", values);
    console.log("Override ID:", id);

    const result = db.prepare(query).run(...values);
    console.log("Override Result:", result);

    if (result.changes === 0) {
      db.close();
      return NextResponse.json(
        { error: "Cash book entry not found", id, query },
        { status: 404 }
      );
    }

    // Recalculate subsequent rows
    await recalculateFromDate(db, id);

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
    const query = `UPDATE cash_book SET override_${field} = 0 WHERE id = ?`;
    const result = db.prepare(query).run(id);

    if (result.changes === 0) {
      db.close();
      return NextResponse.json(
        { error: "Cash book entry not found" },
        { status: 404 }
      );
    }

    // Recalculate all rows
    await recalculateFromDate(db, id);

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

async function recalculateFromDate(db: Database.Database, fromId: string) {
  // Get all rows from this date onwards and recalculate
  const rows = db
    .prepare("SELECT * FROM cash_book ORDER BY tanggal ASC, created_at ASC")
    .all() as any[];

  const updateStmt = db.prepare(`
    UPDATE cash_book SET
      omzet = ?, biaya_operasional = ?, biaya_bahan = ?, saldo = ?, laba_bersih = ?,
      kasbon_anwar = ?, kasbon_suri = ?, kasbon_cahaya = ?, kasbon_dinil = ?,
      bagi_hasil_anwar = ?, bagi_hasil_suri = ?, bagi_hasil_gemi = ?
    WHERE id = ?
  `);

  let runningOmzet = 0;
  let runningBiayaOps = 0;
  let runningBiayaBahan = 0;
  let runningSaldo = 0;
  let runningLabaBersih = 0;
  let runningKasbonAnwar = 0;
  let runningKasbonSuri = 0;
  let runningKasbonCahaya = 0;
  let runningKasbonDinil = 0;
  let runningBagiHasilAnwar = 0;
  let runningBagiHasilSuri = 0;
  let runningBagiHasilGemi = 0;

  for (const row of rows) {
    const cat = row.kategori_transaksi;
    const debit = row.debit || 0;
    const kredit = row.kredit || 0;

    // Omzet
    if (!row.override_omzet) {
      if (cat === "OMZET") runningOmzet += debit;
      if (cat === "LUNAS") runningOmzet += debit;
    } else {
      runningOmzet = row.omzet;
    }

    // Biaya Operasional
    if (!row.override_biaya_operasional) {
      if (cat === "BIAYA") runningBiayaOps += kredit;
      if (cat === "SUBSIDI") runningBiayaOps -= kredit;
      if (cat === "KOMISI") runningBiayaOps += kredit;
    } else {
      runningBiayaOps = row.biaya_operasional;
    }

    // Biaya Bahan
    if (!row.override_biaya_bahan) {
      if (cat === "SUPPLY") runningBiayaBahan += kredit;
    } else {
      runningBiayaBahan = row.biaya_bahan;
    }

    // Saldo
    if (!row.override_saldo) {
      runningSaldo += debit - kredit;
    } else {
      runningSaldo = row.saldo;
    }

    // Laba Bersih
    if (!row.override_laba_bersih) {
      runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;
    } else {
      runningLabaBersih = row.laba_bersih;
    }

    // Kasbon
    if (!row.override_kasbon_anwar) {
      if (cat === "PRIBADI-A") runningKasbonAnwar += kredit;
    } else {
      runningKasbonAnwar = row.kasbon_anwar;
    }

    if (!row.override_kasbon_suri) {
      if (cat === "PRIBADI-S") runningKasbonSuri += kredit;
    } else {
      runningKasbonSuri = row.kasbon_suri;
    }

    if (!row.override_kasbon_cahaya) {
      if (cat === "BIAYA" && row.keperluan?.toLowerCase().includes("cahaya"))
        runningKasbonCahaya += kredit;
    } else {
      runningKasbonCahaya = row.kasbon_cahaya;
    }

    if (!row.override_kasbon_dinil) {
      if (cat === "BIAYA" && row.keperluan?.toLowerCase().includes("dinil"))
        runningKasbonDinil += kredit;
    } else {
      runningKasbonDinil = row.kasbon_dinil;
    }

    // Bagi Hasil
    if (!row.override_bagi_hasil_anwar) {
      if (cat === "LABA") {
        const split = runningLabaBersih / 3;
        runningBagiHasilAnwar += split;
      }
    } else {
      runningBagiHasilAnwar = row.bagi_hasil_anwar;
    }

    if (!row.override_bagi_hasil_suri) {
      if (cat === "LABA") {
        const split = runningLabaBersih / 3;
        runningBagiHasilSuri += split;
      }
    } else {
      runningBagiHasilSuri = row.bagi_hasil_suri;
    }

    if (!row.override_bagi_hasil_gemi) {
      if (cat === "LABA") {
        const split = runningLabaBersih / 3;
        runningBagiHasilGemi += split;
      }
    } else {
      runningBagiHasilGemi = row.bagi_hasil_gemi;
    }

    updateStmt.run(
      runningOmzet,
      runningBiayaOps,
      runningBiayaBahan,
      runningSaldo,
      runningLabaBersih,
      runningKasbonAnwar,
      runningKasbonSuri,
      runningKasbonCahaya,
      runningKasbonDinil,
      runningBagiHasilAnwar,
      runningBagiHasilSuri,
      runningBagiHasilGemi,
      row.id
    );
  }
}
