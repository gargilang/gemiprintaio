import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import { join } from "path";
import { randomUUID } from "crypto";

const DB_FILE = join(process.cwd(), "database", "gemiprintaio.db");

const ALLOWED_CATEGORIES = new Set([
  "KAS",
  "BIAYA",
  "OMZET",
  "INVESTOR",
  "SUBSIDI",
  "LUNAS",
  "SUPPLY",
  "LABA",
  "KOMISI",
  "TABUNGAN",
  "HUTANG",
  "PIUTANG",
  "PRIBADI-A",
  "PRIBADI-S",
]);

function normalizeCategory(raw: any) {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;
  v = v.toUpperCase().replace(/\s+/g, "-").replace(/[–—]/g, "-");
  if (v === "PRIBADI-A" || v === "PRIBADI-ANWAR") v = "PRIBADI-A";
  if (v === "PRIBADI-S" || v === "PRIBADI-SURI") v = "PRIBADI-S";
  return ALLOWED_CATEGORIES.has(v) ? v : null;
}

function toNumber(raw: any): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  let v = String(raw).trim();

  // Remove currency prefix (Rp, IDR, etc.)
  v = v.replace(/^(Rp|IDR|rp)\s*/i, "");
  v = v.replace(/\s+/g, "");

  const commaCount = (v.match(/,/g) || []).length;
  const dotCount = (v.match(/\./g) || []).length;

  if (commaCount > 1) {
    // Multiple commas = US format (5,085,464)
    v = v.replace(/,/g, "");
  } else if (dotCount > 1) {
    // Multiple dots = Indonesian format (5.085.464 or 5.085.464,50)
    v = v.replace(/\./g, "");
    if (commaCount === 1) {
      v = v.replace(/,/g, ".");
    }
  } else if (commaCount === 1 && dotCount === 1) {
    const commaPos = v.indexOf(",");
    const dotPos = v.indexOf(".");
    if (dotPos > commaPos) {
      // Format: 1,234.56
      v = v.replace(/,/g, "");
    } else {
      // Format: 1.234,56
      v = v.replace(/\./g, "");
      v = v.replace(/,/g, ".");
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = v.split(",");
    if (parts[1] && parts[1].length <= 2) {
      v = v.replace(/,/g, ".");
    } else {
      v = v.replace(/,/g, "");
    }
  } else if (commaCount === 0 && dotCount === 1) {
    const parts = v.split(".");
    if (parts[1] && parts[1].length === 3) {
      v = v.replace(/\./g, "");
    }
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Try ISO first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try parsing slash or dash separated dates
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    let [_, p1, p2, year] = parts;

    if (year.length === 2) {
      year = (Number(year) >= 50 ? "19" : "20") + year;
    }

    let month, day;
    if (Number(p1) > 12) {
      day = p1;
      month = p2;
    } else if (Number(p2) > 12) {
      month = p1;
      day = p2;
    } else {
      // Default to MM/DD/YYYY (Google Sheets format)
      month = p1;
      day = p2;
    }

    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");

    const testDate = new Date(`${year}-${mm}-${dd}`);
    if (isNaN(testDate.getTime())) {
      return null;
    }

    return `${year}-${mm}-${dd}`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const append = formData.get("append") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();

    let records;
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: "Failed to parse CSV", details: err.message },
        { status: 400 }
      );
    }

    const db = new Database(DB_FILE);
    db.pragma("foreign_keys = ON");

    if (!append) {
      db.prepare("DELETE FROM cash_book").run();
    }

    const insertStmt = db.prepare(`
      INSERT INTO cash_book (
        id, tanggal, kategori_transaksi, debit, kredit, keperluan,
        omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
        kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
        bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
        display_order
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0,
        ?
      )
    `);

    let imported = 0;
    let skipped = 0;

    // Calculate total records first to set display_order in reverse
    const totalRecords = records.length;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const tanggal = parseDate(row.TANGGAL);
      const kategori = normalizeCategory(row.KATEGORI);
      const debit = toNumber(row.DEBIT);
      const kredit = toNumber(row.KREDIT);
      const keperluan = row.KEPERLUAN?.trim() || "";

      if (!tanggal) {
        skipped++;
        continue;
      }
      if (!kategori) {
        skipped++;
        continue;
      }

      const id = randomUUID();
      // Set display_order in reverse: first row in CSV gets highest number (appears at top when sorted ASC)
      const displayOrder = totalRecords - i;
      insertStmt.run(
        id,
        tanggal,
        kategori,
        debit,
        kredit,
        keperluan,
        displayOrder
      );
      imported++;
    }

    // Auto recalculate
    await recalculateCashbook(db);

    db.close();

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      message: `Successfully imported ${imported} records${
        skipped > 0 ? ` (${skipped} skipped)` : ""
      }`,
    });
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to import CSV", details: error.message },
      { status: 500 }
    );
  }
}

async function recalculateCashbook(db: Database.Database) {
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
