import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { join } from "path";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reorderedIds } = body;

    if (!Array.isArray(reorderedIds) || reorderedIds.length === 0) {
      return NextResponse.json(
        { error: "Invalid reorderedIds array" },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    // Update display_order for each row
    const updateStmt = db.prepare(
      "UPDATE cash_book SET display_order = ? WHERE id = ?"
    );

    reorderedIds.forEach((id, index) => {
      updateStmt.run(index, id);
    });

    // Recalculate all rows
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      message: "Successfully reordered and recalculated",
    });
  } catch (error: any) {
    console.error("Reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder rows", details: error.message },
      { status: 500 }
    );
  }
}

async function recalculateCashbook(db: Database.Database) {
  const rows = db
    .prepare(
      "SELECT * FROM cash_book WHERE archived_at IS NULL ORDER BY display_order ASC"
    )
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
