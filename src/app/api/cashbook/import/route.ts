import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import { join } from "path";
import { randomUUID } from "crypto";
import { recalculateCashbook } from "@/lib/calculate-cashbook";

const DB_FILE = join(process.cwd(), "database", "gemiprint.db");

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
      db.prepare("DELETE FROM keuangan").run();
    }

    const insertStmt = db.prepare(`
      INSERT INTO keuangan (
        id, tanggal, kategori_transaksi, debit, kredit, keperluan,
        omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
        kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
        bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
        urutan_tampilan, dibuat_pada, diperbarui_pada
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        0, 0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0,
        ?, datetime('now'), datetime('now')
      )
    `);

    let imported = 0;
    let skipped = 0;

    // Get max urutan_tampilan to continue numbering
    const maxOrderResult = db
      .prepare(`SELECT MAX(urutan_tampilan) as max_order FROM keuangan`)
      .get() as any;

    let nextDisplayOrder = (maxOrderResult?.max_order || 0) + 1;

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
      // Set display_order sequentially: first row in CSV = oldest transaction = lowest order
      // Last row in CSV = newest transaction = highest order
      insertStmt.run(
        id,
        tanggal,
        kategori,
        debit,
        kredit,
        keperluan,
        nextDisplayOrder
      );
      nextDisplayOrder++;
      imported++;
    }

    // Auto recalculate using centralized function
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
