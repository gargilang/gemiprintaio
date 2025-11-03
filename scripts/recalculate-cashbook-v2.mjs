// Recalculate All Cash Book Entries with Override Support
// This script respects manual override flags set by admin
// Jalankan dengan: node recalculate-cashbook-v2.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("RECALCULATE CASH BOOK (WITH OVERRIDE SUPPORT)");
console.log("=".repeat(70));

try {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  // Check if override columns exist
  const columns = db.prepare("PRAGMA table_info(cash_book)").all();
  const hasOverrideFlags = columns.some((col) => col.name === "override_saldo");

  if (!hasOverrideFlags) {
    console.log("\n⚠️  Override flags not found in database.");
    console.log("⚠️  Run migration first: npm run db:migrate-override");
    console.log("⚠️  Falling back to standard recalculation...\n");
  }

  // Get all entries in chronological order
  const entries = db
    .prepare(`SELECT * FROM cash_book ORDER BY tanggal ASC, created_at ASC`)
    .all();

  console.log(`\nTotal entries: ${entries.length}`);
  if (hasOverrideFlags) {
    const overrideCount = entries.filter(
      (e) =>
        e.override_saldo ||
        e.override_omzet ||
        e.override_biaya_operasional ||
        e.override_biaya_bahan ||
        e.override_laba_bersih ||
        e.override_kasbon_anwar ||
        e.override_kasbon_suri ||
        e.override_kasbon_cahaya ||
        e.override_kasbon_dinil ||
        e.override_bagi_hasil_anwar ||
        e.override_bagi_hasil_suri ||
        e.override_bagi_hasil_gemi
    ).length;
    console.log(`Entries with manual overrides: ${overrideCount}\n`);
  } else {
    console.log();
  }

  if (entries.length === 0) {
    console.log("No entries to recalculate");
    db.close();
    process.exit(0);
  }

  // Initialize running totals
  let runningOmzet = 0;
  let runningBiayaOperasional = 0;
  let runningBiayaBahan = 0;
  let runningSaldo = 0;
  let runningBagiHasilAnwar = 0;
  let runningBagiHasilSuri = 0;
  let runningBagiHasilGemi = 0;
  let runningKasbonAnwar = 0;
  let runningKasbonSuri = 0;
  let runningKasbonCahaya = 0;
  let runningKasbonDinil = 0;

  const updateStmt = db.prepare(`
    UPDATE cash_book 
    SET omzet = ?, 
        biaya_operasional = ?,
        biaya_bahan = ?,
        saldo = ?, 
        laba_bersih = ?,
        bagi_hasil_anwar = ?,
        bagi_hasil_suri = ?,
        bagi_hasil_gemi = ?,
        kasbon_anwar = ?,
        kasbon_suri = ?,
        kasbon_cahaya = ?,
        kasbon_dinil = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const now = new Date().toISOString();

  // Process each entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const debit = entry.debit || 0;
    const kredit = entry.kredit || 0;
    const kategori = entry.kategori_transaksi;
    const keperluan = (entry.keperluan || "").toLowerCase();
    const isFirstEntry = i === 0;

    // Check override flags (default to false if column doesn't exist)
    const overrideSaldo = hasOverrideFlags && entry.override_saldo === 1;
    const overrideOmzet = hasOverrideFlags && entry.override_omzet === 1;
    const overrideBiayaOp =
      hasOverrideFlags && entry.override_biaya_operasional === 1;
    const overrideBiayaBahan =
      hasOverrideFlags && entry.override_biaya_bahan === 1;
    const overrideLabaBersih =
      hasOverrideFlags && entry.override_laba_bersih === 1;
    const overrideKasbonAnwar =
      hasOverrideFlags && entry.override_kasbon_anwar === 1;
    const overrideKasbonSuri =
      hasOverrideFlags && entry.override_kasbon_suri === 1;
    const overrideKasbonCahaya =
      hasOverrideFlags && entry.override_kasbon_cahaya === 1;
    const overrideKasbonDinil =
      hasOverrideFlags && entry.override_kasbon_dinil === 1;
    const overrideBagiHasilAnwar =
      hasOverrideFlags && entry.override_bagi_hasil_anwar === 1;
    const overrideBagiHasilSuri =
      hasOverrideFlags && entry.override_bagi_hasil_suri === 1;
    const overrideBagiHasilGemi =
      hasOverrideFlags && entry.override_bagi_hasil_gemi === 1;

    const hasAnyOverride =
      overrideSaldo ||
      overrideOmzet ||
      overrideBiayaOp ||
      overrideBiayaBahan ||
      overrideLabaBersih ||
      overrideKasbonAnwar ||
      overrideKasbonSuri ||
      overrideKasbonCahaya ||
      overrideKasbonDinil ||
      overrideBagiHasilAnwar ||
      overrideBagiHasilSuri ||
      overrideBagiHasilGemi;

    console.log(
      `Processing: ${entry.tanggal} - ${kategori} (${
        debit > 0 ? `+${debit}` : `-${kredit}`
      })${hasAnyOverride ? " [OVERRIDE]" : ""}`
    );

    // Store previous values
    const prevOmzet = runningOmzet;
    const prevBiayaOp = runningBiayaOperasional;
    const prevBiayaBahan = runningBiayaBahan;
    const prevLabaBersih = prevOmzet - prevBiayaOp - prevBiayaBahan;
    const prevBagiHasilGemi = runningBagiHasilGemi;
    const prevKasbonAnwar = runningKasbonAnwar;
    const prevKasbonSuri = runningKasbonSuri;
    const prevKasbonCahaya = runningKasbonCahaya;
    const prevKasbonDinil = runningKasbonDinil;

    // Calculate new values (respect overrides)
    let newOmzet, newBiayaOp, newBiayaBahan, newSaldo, newLabaBersih;
    let newKasbonAnwar, newKasbonSuri, newKasbonCahaya, newKasbonDinil;
    let newBagiHasilAnwar, newBagiHasilSuri, newBagiHasilGemi;

    // G: OMZET
    if (overrideOmzet) {
      newOmzet = entry.omzet; // Keep manual value
      runningOmzet = newOmzet;
    } else {
      if (kategori === "OMZET" || kategori === "PIUTANG") {
        runningOmzet = isFirstEntry ? debit : runningOmzet + debit;
      } else {
        runningOmzet = isFirstEntry ? 0 : runningOmzet;
      }
      newOmzet = runningOmzet;
    }

    // H: BIAYA OPERASIONAL
    if (overrideBiayaOp) {
      newBiayaOp = entry.biaya_operasional;
      runningBiayaOperasional = newBiayaOp;
    } else {
      if (isFirstEntry) {
        runningBiayaOperasional = 0;
      } else {
        if (kategori === "BIAYA" || kategori === "TABUNGAN") {
          runningBiayaOperasional = runningBiayaOperasional + kredit;
        }
      }
      newBiayaOp = runningBiayaOperasional;
    }

    // I: BIAYA BAHAN
    if (overrideBiayaBahan) {
      newBiayaBahan = entry.biaya_bahan;
      runningBiayaBahan = newBiayaBahan;
    } else {
      if (isFirstEntry) {
        runningBiayaBahan = 0;
      } else {
        if (kategori === "SUPPLY" || kategori === "HUTANG") {
          runningBiayaBahan = runningBiayaBahan + kredit;
        }
      }
      newBiayaBahan = runningBiayaBahan;
    }

    // J: SALDO
    if (overrideSaldo) {
      newSaldo = entry.saldo; // Keep manual value
      runningSaldo = newSaldo;
    } else {
      runningSaldo = isFirstEntry
        ? debit - kredit
        : runningSaldo + debit - kredit;
      newSaldo = runningSaldo;
    }

    // K: LABA BERSIH
    if (overrideLabaBersih) {
      newLabaBersih = entry.laba_bersih;
    } else {
      newLabaBersih =
        runningOmzet - (runningBiayaOperasional + runningBiayaBahan);
    }

    // L: KASBON ANWAR
    if (overrideKasbonAnwar) {
      newKasbonAnwar = entry.kasbon_anwar;
      runningKasbonAnwar = newKasbonAnwar;
    } else {
      if (kategori === "PRIBADI-A") {
        if (isFirstEntry) {
          runningKasbonAnwar = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonAnwar =
            debit > 0 ? prevKasbonAnwar - debit : prevKasbonAnwar + kredit;
        }
      } else {
        runningKasbonAnwar = isFirstEntry ? 0 : prevKasbonAnwar;
      }
      newKasbonAnwar = runningKasbonAnwar;
    }

    // M: KASBON SURI
    if (overrideKasbonSuri) {
      newKasbonSuri = entry.kasbon_suri;
      runningKasbonSuri = newKasbonSuri;
    } else {
      if (kategori === "PRIBADI-S") {
        if (isFirstEntry) {
          runningKasbonSuri = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonSuri =
            debit > 0 ? prevKasbonSuri - debit : prevKasbonSuri + kredit;
        }
      } else {
        runningKasbonSuri = isFirstEntry ? 0 : prevKasbonSuri;
      }
      newKasbonSuri = runningKasbonSuri;
    }

    // N: BAGI HASIL ANWAR
    if (overrideBagiHasilAnwar) {
      newBagiHasilAnwar = entry.bagi_hasil_anwar;
      runningBagiHasilAnwar = newBagiHasilAnwar;
    } else {
      runningBagiHasilAnwar = newLabaBersih / 3 - runningKasbonAnwar;
      newBagiHasilAnwar = runningBagiHasilAnwar;
    }

    // O: BAGI HASIL SURI
    if (overrideBagiHasilSuri) {
      newBagiHasilSuri = entry.bagi_hasil_suri;
      runningBagiHasilSuri = newBagiHasilSuri;
    } else {
      runningBagiHasilSuri = newLabaBersih / 3 - runningKasbonSuri;
      newBagiHasilSuri = runningBagiHasilSuri;
    }

    // P: BAGI HASIL GEMI
    if (overrideBagiHasilGemi) {
      newBagiHasilGemi = entry.bagi_hasil_gemi;
      runningBagiHasilGemi = newBagiHasilGemi;
    } else {
      const labaIncrement = isFirstEntry
        ? newLabaBersih
        : newLabaBersih - prevLabaBersih;
      const investorDebit = kategori === "INVESTOR" ? debit : 0;
      const investorKredit = kategori === "INVESTOR" ? kredit : 0;
      runningBagiHasilGemi =
        labaIncrement / 3 + prevBagiHasilGemi + investorDebit - investorKredit;
      newBagiHasilGemi = runningBagiHasilGemi;
    }

    // Q: KASBON CAHAYA
    if (overrideKasbonCahaya) {
      newKasbonCahaya = entry.kasbon_cahaya;
      runningKasbonCahaya = newKasbonCahaya;
    } else {
      const hasCahaya = keperluan.includes("cahaya");
      const isCahayaCategory = kategori === "INVESTOR" || kategori === "BIAYA";
      if (hasCahaya && isCahayaCategory) {
        if (isFirstEntry) {
          runningKasbonCahaya = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonCahaya =
            debit > 0 ? prevKasbonCahaya - debit : prevKasbonCahaya + kredit;
        }
      } else {
        runningKasbonCahaya = isFirstEntry ? 0 : prevKasbonCahaya;
      }
      newKasbonCahaya = runningKasbonCahaya;
    }

    // R: KASBON DINIL
    if (overrideKasbonDinil) {
      newKasbonDinil = entry.kasbon_dinil;
      runningKasbonDinil = newKasbonDinil;
    } else {
      const hasDinil = keperluan.includes("dinil");
      const isDinilCategory = kategori === "INVESTOR" || kategori === "BIAYA";
      if (hasDinil && isDinilCategory) {
        if (isFirstEntry) {
          runningKasbonDinil = debit > 0 ? -debit : kredit;
        } else {
          runningKasbonDinil =
            debit > 0 ? prevKasbonDinil - debit : prevKasbonDinil + kredit;
        }
      } else {
        runningKasbonDinil = isFirstEntry ? 0 : prevKasbonDinil;
      }
      newKasbonDinil = runningKasbonDinil;
    }

    // Update entry
    updateStmt.run(
      newOmzet,
      newBiayaOp,
      newBiayaBahan,
      newSaldo,
      newLabaBersih,
      newBagiHasilAnwar,
      newBagiHasilSuri,
      newBagiHasilGemi,
      newKasbonAnwar,
      newKasbonSuri,
      newKasbonCahaya,
      newKasbonDinil,
      now,
      entry.id
    );
  }

  console.log("\n" + "=".repeat(70));
  console.log("FINAL RESULT");
  console.log("=".repeat(70));
  console.log(`Saldo: Rp ${runningSaldo.toLocaleString("id-ID")}`);
  console.log(
    `Laba Bersih: Rp ${(
      runningOmzet -
      runningBiayaOperasional -
      runningBiayaBahan
    ).toLocaleString("id-ID")}`
  );
  console.log(`\nBagi Hasil:`);
  console.log(`  - Anwar: Rp ${runningBagiHasilAnwar.toLocaleString("id-ID")}`);
  console.log(`  - Suri:  Rp ${runningBagiHasilSuri.toLocaleString("id-ID")}`);
  console.log(`  - Gemi:  Rp ${runningBagiHasilGemi.toLocaleString("id-ID")}`);
  console.log(`\nKasbon:`);
  console.log(`  - Anwar:  Rp ${runningKasbonAnwar.toLocaleString("id-ID")}`);
  console.log(`  - Suri:   Rp ${runningKasbonSuri.toLocaleString("id-ID")}`);
  console.log(`  - Cahaya: Rp ${runningKasbonCahaya.toLocaleString("id-ID")}`);
  console.log(`  - Dinil:  Rp ${runningKasbonDinil.toLocaleString("id-ID")}`);

  db.close();
  console.log("\n✅ Recalculation complete!\n");
} catch (error) {
  console.error("❌ Error:", error.message);
  console.error(error.stack);
  process.exit(1);
}
