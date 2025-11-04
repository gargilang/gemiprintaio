#!/usr/bin/env node
/**
 * Script to trigger recalculation of all cashbook entries
 * and verify the results
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../database/gemiprintaio.db");

console.log("🔄 Triggering Cashbook Recalculation\n");
console.log(`Database: ${dbPath}\n`);

try {
  const db = new Database(dbPath);

  console.log(
    "📊 Before Recalculation - First 5 entries (by display_order ASC):\n"
  );

  const beforeCalc = db
    .prepare(
      `
      SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order,
             omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
             kasbon_anwar, kasbon_suri, bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order ASC, created_at ASC
      LIMIT 5
    `
    )
    .all();

  beforeCalc.forEach((row, idx) => {
    console.log(`${idx + 1}. ${row.keperluan}`);
    console.log(
      `   Display Order: ${row.display_order}, Created: ${row.created_at}`
    );
    console.log(`   Debit: ${row.debit}, Kredit: ${row.kredit}`);
    console.log(
      `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
    );
    console.log(`   Kasbon A: ${row.kasbon_anwar}, S: ${row.kasbon_suri}`);
    console.log(
      `   Bagi Hasil A: ${row.bagi_hasil_anwar}, S: ${row.bagi_hasil_suri}, G: ${row.bagi_hasil_gemi}\n`
    );
  });

  // Call the recalculation via API
  console.log("🔄 Triggering recalculation via API endpoint...\n");

  // Since we can't easily call the API from here, let's do the recalculation directly
  // using the same logic as in calculate-cashbook.ts

  const rows = db
    .prepare(
      `SELECT * FROM cash_book WHERE archived_at IS NULL ORDER BY display_order ASC, created_at ASC`
    )
    .all();

  if (rows.length === 0) {
    console.log("No active transactions to recalculate.\n");
    db.close();
    process.exit(0);
  }

  const updateStmt = db.prepare(`
    UPDATE cash_book SET
      omzet = ?, biaya_operasional = ?, biaya_bahan = ?, saldo = ?, laba_bersih = ?,
      kasbon_anwar = ?, kasbon_suri = ?, kasbon_cahaya = ?, kasbon_dinil = ?,
      bagi_hasil_anwar = ?, bagi_hasil_suri = ?, bagi_hasil_gemi = ?
    WHERE id = ?
  `);

  // Initialize running totals
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
  let prevLabaBersih = 0;

  for (const row of rows) {
    const cat = row.kategori_transaksi;
    const debit = row.debit || 0;
    const kredit = row.kredit || 0;
    const keperluan = (row.keperluan || "").toLowerCase();

    // OMZET: Accumulate from OMZET or PIUTANG
    if (!row.override_omzet) {
      if (cat === "OMZET" || cat === "PIUTANG") {
        runningOmzet += debit;
      }
    } else {
      runningOmzet = row.omzet;
    }

    // BIAYA OPERASIONAL: Accumulate from BIAYA or TABUNGAN
    if (!row.override_biaya_operasional) {
      if (cat === "BIAYA" || cat === "TABUNGAN") {
        runningBiayaOps += kredit;
      }
    } else {
      runningBiayaOps = row.biaya_operasional;
    }

    // BIAYA BAHAN: Accumulate from SUPPLY or HUTANG
    if (!row.override_biaya_bahan) {
      if (cat === "SUPPLY" || cat === "HUTANG") {
        runningBiayaBahan += kredit;
      }
    } else {
      runningBiayaBahan = row.biaya_bahan;
    }

    // SALDO: Running balance (debit - kredit)
    if (!row.override_saldo) {
      runningSaldo += debit - kredit;
    } else {
      runningSaldo = row.saldo;
    }

    // LABA BERSIH: Omzet - Biaya Operasional - Biaya Bahan
    if (!row.override_laba_bersih) {
      runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;
    } else {
      runningLabaBersih = row.laba_bersih;
    }

    // KASBON ANWAR: PRIBADI-A category, debit decreases, kredit increases
    if (!row.override_kasbon_anwar) {
      if (cat === "PRIBADI-A") {
        runningKasbonAnwar += kredit - debit;
      }
    } else {
      runningKasbonAnwar = row.kasbon_anwar;
    }

    // KASBON SURI: PRIBADI-S category, debit decreases, kredit increases
    if (!row.override_kasbon_suri) {
      if (cat === "PRIBADI-S") {
        runningKasbonSuri += kredit - debit;
      }
    } else {
      runningKasbonSuri = row.kasbon_suri;
    }

    // KASBON CAHAYA: INVESTOR or BIAYA with "cahaya" in keperluan
    if (!row.override_kasbon_cahaya) {
      const isCahaya = keperluan.includes("cahaya");
      if (isCahaya && (cat === "INVESTOR" || cat === "BIAYA")) {
        runningKasbonCahaya += kredit - debit;
      }
    } else {
      runningKasbonCahaya = row.kasbon_cahaya;
    }

    // KASBON DINIL: INVESTOR or BIAYA with "dinil" in keperluan
    if (!row.override_kasbon_dinil) {
      const isDinil = keperluan.includes("dinil");
      if (isDinil && (cat === "INVESTOR" || cat === "BIAYA")) {
        runningKasbonDinil += kredit - debit;
      }
    } else {
      runningKasbonDinil = row.kasbon_dinil;
    }

    // BAGI HASIL ANWAR: (Laba Bersih / 3) - Kasbon Anwar
    if (!row.override_bagi_hasil_anwar) {
      runningBagiHasilAnwar = runningLabaBersih / 3 - runningKasbonAnwar;
    } else {
      runningBagiHasilAnwar = row.bagi_hasil_anwar;
    }

    // BAGI HASIL SURI: (Laba Bersih / 3) - Kasbon Suri
    if (!row.override_bagi_hasil_suri) {
      runningBagiHasilSuri = runningLabaBersih / 3 - runningKasbonSuri;
    } else {
      runningBagiHasilSuri = row.bagi_hasil_suri;
    }

    // BAGI HASIL GEMI: (Delta Laba Bersih / 3) + Previous Bagi Hasil Gemi + INVESTOR adjustments
    if (!row.override_bagi_hasil_gemi) {
      const labaIncrement = runningLabaBersih - prevLabaBersih;
      runningBagiHasilGemi += labaIncrement / 3;

      // Add INVESTOR debit, subtract INVESTOR kredit
      if (cat === "INVESTOR") {
        runningBagiHasilGemi += debit - kredit;
      }
    } else {
      runningBagiHasilGemi = row.bagi_hasil_gemi;
    }

    // Update the entry with calculated values
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

    // Store previous laba bersih for next iteration
    prevLabaBersih = runningLabaBersih;
  }

  console.log(`✅ Recalculated ${rows.length} entries\n`);

  console.log(
    "📊 After Recalculation - First 5 entries (by display_order ASC):\n"
  );

  const afterCalc = db
    .prepare(
      `
      SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order,
             omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
             kasbon_anwar, kasbon_suri, bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order ASC, created_at ASC
      LIMIT 5
    `
    )
    .all();

  afterCalc.forEach((row, idx) => {
    console.log(`${idx + 1}. ${row.keperluan}`);
    console.log(
      `   Display Order: ${row.display_order}, Created: ${row.created_at}`
    );
    console.log(`   Debit: ${row.debit}, Kredit: ${row.kredit}`);
    console.log(
      `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
    );
    console.log(`   Kasbon A: ${row.kasbon_anwar}, S: ${row.kasbon_suri}`);
    console.log(
      `   Bagi Hasil A: ${row.bagi_hasil_anwar}, S: ${row.bagi_hasil_suri}, G: ${row.bagi_hasil_gemi}\n`
    );
  });

  console.log("📊 Last 3 entries (by display_order DESC - most recent):\n");

  const lastEntries = db
    .prepare(
      `
      SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order,
             omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
             kasbon_anwar, kasbon_suri, bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order DESC, created_at DESC
      LIMIT 3
    `
    )
    .all();

  lastEntries.forEach((row, idx) => {
    console.log(`${idx + 1}. ${row.keperluan} (${row.tanggal})`);
    console.log(
      `   Display Order: ${row.display_order}, Created: ${row.created_at}`
    );
    console.log(`   Debit: ${row.debit}, Kredit: ${row.kredit}`);
    console.log(
      `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
    );
    console.log(`   Kasbon A: ${row.kasbon_anwar}, S: ${row.kasbon_suri}`);
    console.log(
      `   Bagi Hasil A: ${row.bagi_hasil_anwar}, S: ${row.bagi_hasil_suri}, G: ${row.bagi_hasil_gemi}\n`
    );
  });

  db.close();

  console.log("✅ Recalculation complete!");
  console.log(
    "\n📝 Note: The first entries should now start from low values (e.g., Omzet starting from first transaction)"
  );
  console.log(
    "   and the last entries should have the highest accumulated values.\n"
  );
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
