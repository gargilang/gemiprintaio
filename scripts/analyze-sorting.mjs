#!/usr/bin/env node
/**
 * Script to analyze the current state of cashbook database sorting
 * Checks both active and archived transactions
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../database/gemiprintaio.db");

console.log("📊 Analyzing Cashbook Database Sorting\n");
console.log(`Database: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Analyze active transactions
  console.log("=== ACTIVE TRANSACTIONS (archived_at IS NULL) ===\n");

  const activeByCreated = db
    .prepare(
      `
      SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order,
             omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
             kasbon_anwar, kasbon_suri, bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY created_at ASC
      LIMIT 10
    `
    )
    .all();

  console.log("📅 Sorted by created_at ASC (oldest first):");
  console.log("This is how calculations SHOULD be ordered\n");
  activeByCreated.forEach((row, idx) => {
    console.log(`${idx + 1}. ID: ${row.id}`);
    console.log(`   Created: ${row.created_at}`);
    console.log(`   Display Order: ${row.display_order}`);
    console.log(`   Tanggal: ${row.tanggal}`);
    console.log(`   Keperluan: ${row.keperluan}`);
    console.log(`   Debit: ${row.debit}, Kredit: ${row.kredit}`);
    console.log(
      `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
    );
    console.log(`   Kasbon A: ${row.kasbon_anwar}, S: ${row.kasbon_suri}`);
    console.log(
      `   Bagi Hasil A: ${row.bagi_hasil_anwar}, S: ${row.bagi_hasil_suri}, G: ${row.bagi_hasil_gemi}`
    );
    console.log("");
  });

  const activeByDisplay = db
    .prepare(
      `
      SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order,
             omzet, saldo, laba_bersih
      FROM cash_book 
      WHERE archived_at IS NULL 
      ORDER BY display_order DESC
      LIMIT 10
    `
    )
    .all();

  console.log("\n📊 Sorted by display_order DESC (current calculation order):");
  console.log("This is how calculations are CURRENTLY ordered\n");
  activeByDisplay.forEach((row, idx) => {
    console.log(`${idx + 1}. ID: ${row.id}`);
    console.log(`   Created: ${row.created_at}`);
    console.log(`   Display Order: ${row.display_order}`);
    console.log(`   Tanggal: ${row.tanggal}`);
    console.log(`   Keperluan: ${row.keperluan}`);
    console.log(
      `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
    );
    console.log("");
  });

  // Count active transactions
  const activeCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM cash_book WHERE archived_at IS NULL`
    )
    .get();
  console.log(`\n✅ Total Active Transactions: ${activeCount.count}\n`);

  // Analyze archived transactions
  console.log("\n=== ARCHIVED TRANSACTIONS (archived_at IS NOT NULL) ===\n");

  const archivedCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM cash_book WHERE archived_at IS NOT NULL`
    )
    .get();

  if (archivedCount.count > 0) {
    const archivedByCreated = db
      .prepare(
        `
        SELECT id, tanggal, keperluan, debit, kredit, created_at, display_order, archived_at,
               omzet, saldo, laba_bersih
        FROM cash_book 
        WHERE archived_at IS NOT NULL 
        ORDER BY created_at ASC
        LIMIT 5
      `
      )
      .all();

    console.log("📅 Sorted by created_at ASC (oldest first):\n");
    archivedByCreated.forEach((row, idx) => {
      console.log(`${idx + 1}. ID: ${row.id}`);
      console.log(`   Created: ${row.created_at}`);
      console.log(`   Archived: ${row.archived_at}`);
      console.log(`   Display Order: ${row.display_order}`);
      console.log(`   Tanggal: ${row.tanggal}`);
      console.log(`   Keperluan: ${row.keperluan}`);
      console.log(
        `   Omzet: ${row.omzet}, Saldo: ${row.saldo}, Laba: ${row.laba_bersih}`
      );
      console.log("");
    });

    console.log(`\n✅ Total Archived Transactions: ${archivedCount.count}\n`);
  } else {
    console.log("No archived transactions found.\n");
  }

  // Check for sorting inconsistencies
  console.log("\n=== SORTING ANALYSIS ===\n");

  const createdVsDisplay = db
    .prepare(
      `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at_order != display_order_rank THEN 1 END) as mismatches
      FROM (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY created_at ASC) as created_at_order,
          ROW_NUMBER() OVER (ORDER BY display_order DESC) as display_order_rank
        FROM cash_book
        WHERE archived_at IS NULL
      )
    `
    )
    .get();

  console.log(`Total Active Records: ${createdVsDisplay.total}`);
  console.log(
    `Mismatches (created_at order != display_order order): ${createdVsDisplay.mismatches}`
  );

  if (createdVsDisplay.mismatches > 0) {
    console.log(`\n⚠️  WARNING: Sorting order mismatch detected!`);
    console.log(
      `   created_at order and display_order give DIFFERENT sequences.`
    );
    console.log(`   This can cause calculation errors.\n`);
  } else {
    console.log(
      `\n✅ Sorting orders match (created_at ASC = display_order DESC)\n`
    );
  }

  db.close();

  console.log("\n✅ Analysis complete!");
} catch (error) {
  console.error("❌ Error analyzing database:", error);
  process.exit(1);
}
