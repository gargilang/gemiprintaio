#!/usr/bin/env node
/**
 * Verification script to check if summary cards, kasbon, and bagi hasil
 * are correctly calculated after the fixes
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../database/gemiprintaio.db");

console.log("✅ Verification of Cashbook Calculations\n");
console.log(`Database: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Get the summary (last entry which has the accumulated totals)
  const summary = db
    .prepare(
      `
      SELECT 
        omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
        kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
        bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi,
        created_at, display_order
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order DESC, created_at DESC
      LIMIT 1
    `
    )
    .get();

  if (!summary) {
    console.log("No active transactions found.\n");
    db.close();
    process.exit(0);
  }

  console.log("📊 SUMMARY CARD (Latest/Top Entry - Highest display_order):\n");
  console.log(`Display Order: ${summary.display_order}`);
  console.log(`Created At: ${summary.created_at}\n`);
  console.log("=".repeat(60));
  console.log(
    `OMZET:                 Rp ${summary.omzet.toLocaleString("id-ID")}`
  );
  console.log(
    `BIAYA OPERASIONAL:     Rp ${summary.biaya_operasional.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(
    `BIAYA BAHAN:           Rp ${summary.biaya_bahan.toLocaleString("id-ID")}`
  );
  console.log(
    `SALDO:                 Rp ${summary.saldo.toLocaleString("id-ID")}`
  );
  console.log(
    `LABA BERSIH:           Rp ${summary.laba_bersih.toLocaleString("id-ID")}`
  );
  console.log("=".repeat(60));
  console.log(`\n💰 KASBON:\n`);
  console.log(
    `Kasbon Anwar:          Rp ${summary.kasbon_anwar.toLocaleString("id-ID")}`
  );
  console.log(
    `Kasbon Suri:           Rp ${summary.kasbon_suri.toLocaleString("id-ID")}`
  );
  console.log(
    `Kasbon Cahaya:         Rp ${summary.kasbon_cahaya.toLocaleString("id-ID")}`
  );
  console.log(
    `Kasbon Dinil:          Rp ${summary.kasbon_dinil.toLocaleString("id-ID")}`
  );
  console.log("=".repeat(60));
  console.log(`\n🎯 BAGI HASIL:\n`);
  console.log(
    `Bagi Hasil Anwar:      Rp ${summary.bagi_hasil_anwar.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(
    `Bagi Hasil Suri:       Rp ${summary.bagi_hasil_suri.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(
    `Bagi Hasil Gemi:       Rp ${summary.bagi_hasil_gemi.toLocaleString(
      "id-ID"
    )}`
  );
  console.log("=".repeat(60));

  // Verify calculation logic
  console.log(`\n\n🔍 VERIFICATION CHECKS:\n`);

  // Check 1: Laba Bersih = Omzet - Biaya Operasional - Biaya Bahan
  const expectedLabaBersih =
    summary.omzet - summary.biaya_operasional - summary.biaya_bahan;
  const labaBersihCorrect =
    Math.abs(summary.laba_bersih - expectedLabaBersih) < 1;

  console.log(`1. Laba Bersih Calculation:`);
  console.log(`   Formula: Omzet - Biaya Operasional - Biaya Bahan`);
  console.log(`   Expected: ${expectedLabaBersih.toLocaleString("id-ID")}`);
  console.log(`   Actual:   ${summary.laba_bersih.toLocaleString("id-ID")}`);
  console.log(
    `   Status:   ${labaBersihCorrect ? "✅ CORRECT" : "❌ INCORRECT"}\n`
  );

  // Check 2: Bagi Hasil Anwar = (Laba Bersih / 3) - Kasbon Anwar
  const expectedBagiHasilAnwar = summary.laba_bersih / 3 - summary.kasbon_anwar;
  const bagiHasilAnwarCorrect =
    Math.abs(summary.bagi_hasil_anwar - expectedBagiHasilAnwar) < 1;

  console.log(`2. Bagi Hasil Anwar Calculation:`);
  console.log(`   Formula: (Laba Bersih / 3) - Kasbon Anwar`);
  console.log(`   Expected: ${expectedBagiHasilAnwar.toLocaleString("id-ID")}`);
  console.log(
    `   Actual:   ${summary.bagi_hasil_anwar.toLocaleString("id-ID")}`
  );
  console.log(
    `   Status:   ${bagiHasilAnwarCorrect ? "✅ CORRECT" : "❌ INCORRECT"}\n`
  );

  // Check 3: Bagi Hasil Suri = (Laba Bersih / 3) - Kasbon Suri
  const expectedBagiHasilSuri = summary.laba_bersih / 3 - summary.kasbon_suri;
  const bagiHasilSuriCorrect =
    Math.abs(summary.bagi_hasil_suri - expectedBagiHasilSuri) < 1;

  console.log(`3. Bagi Hasil Suri Calculation:`);
  console.log(`   Formula: (Laba Bersih / 3) - Kasbon Suri`);
  console.log(`   Expected: ${expectedBagiHasilSuri.toLocaleString("id-ID")}`);
  console.log(
    `   Actual:   ${summary.bagi_hasil_suri.toLocaleString("id-ID")}`
  );
  console.log(
    `   Status:   ${bagiHasilSuriCorrect ? "✅ CORRECT" : "❌ INCORRECT"}\n`
  );

  // Check 4: Sum of all three bagi hasil
  const totalBagiHasil =
    summary.bagi_hasil_anwar +
    summary.bagi_hasil_suri +
    summary.bagi_hasil_gemi;

  console.log(`4. Total Bagi Hasil (Anwar + Suri + Gemi):`);
  console.log(`   Total: ${totalBagiHasil.toLocaleString("id-ID")}`);
  console.log(
    `   Note: This should roughly align with Laba Bersih after adjustments\n`
  );

  // Show a few sample transactions to verify categories
  console.log(`\n📝 SAMPLE TRANSACTIONS (First 5 and Last 5):\n`);

  console.log("First 5 (Oldest by display_order ASC):");
  const firstFive = db
    .prepare(
      `
      SELECT tanggal, kategori_transaksi, keperluan, debit, kredit, omzet, saldo, display_order
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order ASC
      LIMIT 5
    `
    )
    .all();

  firstFive.forEach((row, idx) => {
    console.log(
      `  ${idx + 1}. [${row.kategori_transaksi}] ${row.keperluan} (${
        row.tanggal
      })`
    );
    console.log(
      `     Order: ${row.display_order}, Debit: ${row.debit}, Kredit: ${row.kredit}`
    );
    console.log(`     Omzet: ${row.omzet}, Saldo: ${row.saldo}`);
  });

  console.log("\nLast 5 (Newest by display_order DESC):");
  const lastFive = db
    .prepare(
      `
      SELECT tanggal, kategori_transaksi, keperluan, debit, kredit, omzet, saldo, display_order
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order DESC
      LIMIT 5
    `
    )
    .all();

  lastFive.forEach((row, idx) => {
    console.log(
      `  ${idx + 1}. [${row.kategori_transaksi}] ${row.keperluan} (${
        row.tanggal
      })`
    );
    console.log(
      `     Order: ${row.display_order}, Debit: ${row.debit}, Kredit: ${row.kredit}`
    );
    console.log(`     Omzet: ${row.omzet}, Saldo: ${row.saldo}`);
  });

  console.log("\n" + "=".repeat(60));

  const allCorrect =
    labaBersihCorrect && bagiHasilAnwarCorrect && bagiHasilSuriCorrect;

  if (allCorrect) {
    console.log("\n✅ ALL VERIFICATIONS PASSED!");
    console.log(
      "   Summary cards, kasbon, and bagi hasil are correctly calculated.\n"
    );
  } else {
    console.log("\n⚠️  SOME VERIFICATIONS FAILED!");
    console.log("   Please review the calculation logic.\n");
  }

  db.close();
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
