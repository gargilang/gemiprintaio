// Import Cash Book data from a Google Sheets CSV export
// Usage:
//   node import-cashbook-from-csv.mjs <path-to-csv> [--append] [--dry-run]
// Defaults to truncate and re-import unless --append is provided.
// After import, it will automatically run recalculation script.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "❌ CSV path is required. Example: node import-cashbook-from-csv.mjs data.csv --append"
  );
  process.exit(1);
}

const CSV_PATH = resolve(process.cwd(), args[0]);
const APPEND = args.includes("--append");
const DRY_RUN = args.includes("--dry-run");

// Allowed categories per schema
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

function normalizeCategory(raw) {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;
  v = v
    .toUpperCase()
    .replace(/\s+/g, "-") // map spaces to dashes (e.g., "PRIBADI A" => "PRIBADI-A")
    .replace(/[–—]/g, "-");
  // Small alias fixes
  if (v === "PRIBADI-A" || v === "PRIBADI-ANWAR") v = "PRIBADI-A";
  if (v === "PRIBADI-S" || v === "PRIBADI-SURI") v = "PRIBADI-S";
  return ALLOWED_CATEGORIES.has(v) ? v : null;
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  let v = String(raw).trim();

  // Remove currency prefix (Rp, IDR, etc.) and spaces
  v = v.replace(/^(Rp|IDR|rp)\s*/i, "");

  // Remove any remaining spaces
  v = v.replace(/\s+/g, "");

  // Handle Indonesian/European currency format
  // Common patterns:
  // - 5,085,464 (US: commas as thousands)
  // - 5.085.464 (ID: dots as thousands)
  // - 5.085.464,50 (ID: dots as thousands, comma as decimal)
  // - 5,085,464.50 (US: commas as thousands, dot as decimal)
  // - 1234,56 (EU: comma as decimal)
  // - 1234.56 (US: dot as decimal)

  const commaCount = (v.match(/,/g) || []).length;
  const dotCount = (v.match(/\./g) || []).length;

  // Determine format based on pattern
  if (commaCount > 1) {
    // Multiple commas = US format (5,085,464 or 5,085,464.50)
    v = v.replace(/,/g, "");
  } else if (dotCount > 1) {
    // Multiple dots = Indonesian format (5.085.464 or 5.085.464,50)
    v = v.replace(/\./g, ""); // Remove thousand separators
    if (commaCount === 1) {
      v = v.replace(/,/g, "."); // Convert decimal comma to dot
    }
  } else if (commaCount === 1 && dotCount === 1) {
    // One comma and one dot - determine which is decimal
    const commaPos = v.indexOf(",");
    const dotPos = v.indexOf(".");
    if (dotPos > commaPos) {
      // Format: 1,234.56 (US style)
      v = v.replace(/,/g, "");
    } else {
      // Format: 1.234,56 (EU/ID style)
      v = v.replace(/\./g, "");
      v = v.replace(/,/g, ".");
    }
  } else if (commaCount === 1 && dotCount === 0) {
    // Only comma - check if it's decimal or thousand separator
    // If there are 3 digits after comma, it's likely a thousand separator for US format
    // If there are 1-2 digits after comma, it's likely a decimal separator
    const parts = v.split(",");
    if (parts[1] && parts[1].length <= 2) {
      // Likely decimal: 1234,56
      v = v.replace(/,/g, ".");
    } else {
      // Likely thousand separator or ambiguous, assume Indonesian context (no decimals)
      v = v.replace(/,/g, "");
    }
  } else if (commaCount === 0 && dotCount === 1) {
    // Only dot - check if it's decimal or thousand separator
    const parts = v.split(".");
    if (parts[1] && parts[1].length <= 2) {
      // Likely decimal: 1234.56 - keep as is
    } else if (parts[1] && parts[1].length === 3) {
      // Likely thousand separator: 1.000 (Indonesian context)
      v = v.replace(/\./g, "");
    }
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Try ISO first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Try parsing slash or dash separated dates
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    let [_, p1, p2, year] = parts;

    // Normalize year
    if (year.length === 2) {
      year = (Number(year) >= 50 ? "19" : "20") + year;
    }

    // Determine if it's MM/DD/YYYY or DD/MM/YYYY
    // Heuristic: if first part > 12, it must be DD/MM/YYYY
    // Otherwise, assume MM/DD/YYYY (US/Google Sheets format)
    let month, day;

    if (Number(p1) > 12) {
      // Must be DD/MM/YYYY (day > 12)
      day = p1;
      month = p2;
    } else if (Number(p2) > 12) {
      // Must be MM/DD/YYYY (day > 12 in second position)
      month = p1;
      day = p2;
    } else {
      // Ambiguous (both <= 12), default to MM/DD/YYYY (Google Sheets default)
      month = p1;
      day = p2;
    }

    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");

    // Validate date
    const testDate = new Date(`${year}-${mm}-${dd}`);
    if (isNaN(testDate.getTime())) {
      return null; // Invalid date
    }

    return `${year}-${mm}-${dd}`;
  }

  // Fallback to Date parse
  const t = new Date(s);
  if (!isNaN(t.getTime())) {
    const y = String(t.getFullYear());
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const dd = String(t.getDate()).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) o[k] = obj[k];
  return o;
}

console.log("=".repeat(70));
console.log("IMPORT CASH BOOK FROM CSV");
console.log("=".repeat(70));
console.log("CSV:", CSV_PATH);
console.log(
  "Mode:",
  DRY_RUN ? "DRY-RUN" : APPEND ? "APPEND" : "TRUNCATE & IMPORT"
);

try {
  const csvText = readFileSync(CSV_PATH, "utf-8");
  // Use csv-parse to handle quoted fields properly
  const records = parse(csvText, {
    columns: true, // read first row as header
    skip_empty_lines: true,
    trim: true,
  });

  if (!records || records.length === 0) {
    console.error("❌ CSV kosong atau tidak terbaca");
    process.exit(1);
  }

  // Possible header variants (ID: A not used). We need B..F
  const headerMap = {
    tanggal: ["tanggal", "date", "b", "tgl"],
    kategori: ["kategori", "kategori_transaksi", "c"],
    debit: ["debit", "d"],
    kredit: ["kredit", "credit", "e"],
    keperluan: [
      "keperluan",
      "deskripsi",
      "description",
      "f",
      "catatan",
      "notes",
    ],
  };

  function resolveField(obj, candidates) {
    const keys = Object.keys(obj);
    for (const c of candidates) {
      const found = keys.find((k) => k.toLowerCase() === c.toLowerCase());
      if (found) return obj[found];
    }
    return undefined;
  }

  // Transform into cash_book insert payloads
  const transformed = [];
  let errors = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const tanggalRaw = resolveField(row, headerMap.tanggal);
    const kategoriRaw = resolveField(row, headerMap.kategori);
    const debitRaw = resolveField(row, headerMap.debit);
    const kreditRaw = resolveField(row, headerMap.kredit);
    const kepRaw = resolveField(row, headerMap.keperluan);

    const tanggal = parseDate(tanggalRaw);
    const kategori = normalizeCategory(kategoriRaw);
    const debit = toNumber(debitRaw);
    const kredit = toNumber(kreditRaw);
    const keperluan = kepRaw ? String(kepRaw).trim() : null;

    const rowInfo = pick(
      {
        tanggal: tanggalRaw,
        kategori: kategoriRaw,
        debit: debitRaw,
        kredit: kreditRaw,
      },
      ["tanggal", "kategori", "debit", "kredit"]
    );

    if (!tanggal) {
      errors.push({ index: i + 1, error: "Tanggal tidak valid", row: rowInfo });
      continue;
    }
    if (!kategori) {
      errors.push({
        index: i + 1,
        error: `Kategori tidak valid. Harus salah satu dari: ${[
          ...ALLOWED_CATEGORIES,
        ].join(", ")}`,
        row: rowInfo,
      });
      continue;
    }
    if (debit > 0 && kredit > 0) {
      errors.push({
        index: i + 1,
        error: "Tidak boleh ada debit dan kredit sekaligus > 0",
        row: rowInfo,
      });
      continue;
    }

    transformed.push({
      tanggal,
      kategori_transaksi: kategori,
      debit,
      kredit,
      keperluan,
    });
  }

  console.log(`\nRows in CSV: ${records.length}`);
  console.log(`Valid rows:    ${transformed.length}`);
  console.log(`Invalid rows:  ${errors.length}`);
  if (errors.length) {
    console.log("\nContoh error baris pertama (maks 5):");
    errors.slice(0, 5).forEach((e) => {
      console.log(`  - Row ${e.index}: ${e.error}`);
    });
  }

  // Show sample data in dry-run mode
  if (DRY_RUN && transformed.length > 0) {
    console.log("\n📋 Sample data yang akan diimport (5 baris pertama):");
    transformed.slice(0, 5).forEach((r, i) => {
      const debitStr =
        r.debit > 0 ? `Rp ${r.debit.toLocaleString("id-ID")}` : "-";
      const kreditStr =
        r.kredit > 0 ? `Rp ${r.kredit.toLocaleString("id-ID")}` : "-";
      console.log(`  ${i + 1}. ${r.tanggal} | ${r.kategori_transaksi}`);
      console.log(`     Debit: ${debitStr}, Kredit: ${kreditStr}`);
      if (r.keperluan) console.log(`     Keperluan: ${r.keperluan}`);
    });
  }

  if (DRY_RUN) {
    console.log("\n💡 DRY-RUN selesai. Tidak ada perubahan pada database.");
    process.exit(0);
  }

  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  // Disable foreign keys temporarily to bypass old FK references (e.g., profiles_old)
  db.pragma("foreign_keys = OFF");

  const nowISO = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO cash_book (
      id, tanggal, kategori_transaksi, debit, kredit, keperluan,
      omzet, biaya_operasional, biaya_bahan,
      saldo, laba_bersih,
      kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
      bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
      notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, ?, ?)
  `);

  const deleteAll = db.prepare("DELETE FROM cash_book");

  const tx = db.transaction((rows) => {
    if (!APPEND) {
      deleteAll.run();
    }
    for (const r of rows) {
      insertStmt.run(
        randomUUID(),
        r.tanggal,
        r.kategori_transaksi,
        r.debit,
        r.kredit,
        r.keperluan || null,
        nowISO,
        nowISO
      );
    }
  });

  tx(transformed);
  db.close();

  console.log("\n✅ Import selesai dimasukkan ke cash_book.");
  console.log("🔁 Menjalankan kalkulasi ulang sesuai formula...");

  // Run recalculate script in-process by dynamic import
  const recalcPath = join(__dirname, "recalculate-cashbook.mjs");
  const { default: noop } = await import("url").catch(() => ({
    default: null,
  }));
  // Use child process to keep output formatting simple
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(process.execPath, [recalcPath], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error("❌ Gagal menjalankan recalculation. Cek error di atas.");
    process.exit(res.status || 1);
  }

  console.log("\n🎉 Selesai. Data historis sudah diimport dan dihitung.");
} catch (err) {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
}
