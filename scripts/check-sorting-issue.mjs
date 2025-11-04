#!/usr/bin/env node
/**
 * Check Sorting and Calculation Issues
 * Analyze current data to identify sorting problems
 */

import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

console.log("\n🔍 CHECKING SORTING AND CALCULATION ISSUES\n");
console.log("=".repeat(80));

try {
  const db = new Database(DB_FILE);

  // Check active transactions
  console.log("\n📊 ACTIVE TRANSACTIONS:");
  console.log("-".repeat(80));

  const activeTransactions = db
    .prepare(
      `SELECT id, tanggal, kategori_transaksi, debit, kredit, keperluan, 
              display_order, saldo, omzet, created_at
       FROM cash_book 
       WHERE archived_at IS NULL 
       ORDER BY display_order DESC`
    )
    .all();

  console.log(`Total: ${activeTransactions.length} transactions\n`);

  if (activeTransactions.length > 0) {
    console.log("First 10 transactions (should be NEWEST to OLDEST):");
    activeTransactions.slice(0, 10).forEach((row, idx) => {
      console.log(
        `${idx + 1}. [display_order: ${row.display_order}] ${row.tanggal} - ${
          row.kategori_transaksi
        } - Debit: ${row.debit}, Kredit: ${row.kredit}, Saldo: ${row.saldo}`
      );
    });

    console.log("\n\nLast 5 transactions (should be OLDEST):");
    activeTransactions.slice(-5).forEach((row, idx) => {
      console.log(
        `${activeTransactions.length - 4 + idx}. [display_order: ${
          row.display_order
        }] ${row.tanggal} - ${row.kategori_transaksi} - Debit: ${
          row.debit
        }, Kredit: ${row.kredit}, Saldo: ${row.saldo}`
      );
    });

    // Check if display_order is correct
    console.log("\n\n🔢 DISPLAY ORDER ANALYSIS:");
    console.log("-".repeat(80));

    const minOrder = Math.min(
      ...activeTransactions.map((t) => t.display_order)
    );
    const maxOrder = Math.max(
      ...activeTransactions.map((t) => t.display_order)
    );

    console.log(`Min display_order: ${minOrder}`);
    console.log(`Max display_order: ${maxOrder}`);
    console.log(`Expected range: Should be sequential or at least ascending`);

    // Check for gaps or duplicates
    const orders = activeTransactions
      .map((t) => t.display_order)
      .sort((a, b) => a - b);
    const duplicates = orders.filter(
      (item, index) => orders.indexOf(item) !== index
    );

    if (duplicates.length > 0) {
      console.log(
        `\n⚠️  WARNING: Found ${duplicates.length} duplicate display_orders: ${[
          ...new Set(duplicates),
        ].join(", ")}`
      );
    } else {
      console.log("\n✅ No duplicate display_orders found");
    }

    // Check sorting consistency
    console.log("\n\n📈 CALCULATION CHECK (Last Entry):");
    console.log("-".repeat(80));
    const lastEntry = activeTransactions[0]; // Should be latest with DESC order
    console.log(
      `Latest transaction (display_order: ${lastEntry.display_order}):`
    );
    console.log(`  Date: ${lastEntry.tanggal}`);
    console.log(`  Saldo: ${lastEntry.saldo}`);
    console.log(`  Omzet: ${lastEntry.omzet}`);
    console.log(`  Created: ${lastEntry.created_at}`);

    // Simulate calculation from bottom to top
    console.log("\n\n🧮 SIMULATE CALCULATION (Bottom to Top):");
    console.log("-".repeat(80));

    let simulatedSaldo = 0;
    let simulatedOmzet = 0;

    // Calculate from highest display_order to lowest (oldest to newest)
    const sortedForCalc = [...activeTransactions].sort(
      (a, b) => b.display_order - a.display_order
    );

    sortedForCalc.forEach((row, idx) => {
      const debit = row.debit || 0;
      const kredit = row.kredit || 0;

      if (
        row.kategori_transaksi === "OMZET" ||
        row.kategori_transaksi === "PIUTANG"
      ) {
        simulatedOmzet += debit;
      }

      simulatedSaldo += debit - kredit;

      if (idx < 3 || idx >= sortedForCalc.length - 3) {
        console.log(
          `${
            idx === 0
              ? "FIRST"
              : idx === sortedForCalc.length - 1
              ? "LAST"
              : `#${idx + 1}`
          }: [order: ${row.display_order}] ${
            row.tanggal
          } - Sim.Saldo: ${simulatedSaldo} (DB: ${row.saldo}) ${
            simulatedSaldo === row.saldo ? "✅" : "❌ MISMATCH!"
          }`
        );
      }
    });

    console.log(`\nFinal Simulated Saldo: ${simulatedSaldo}`);
    console.log(`DB Saldo (latest): ${lastEntry.saldo}`);
    console.log(
      simulatedSaldo === lastEntry.saldo
        ? "✅ MATCH"
        : "❌ MISMATCH - CALCULATION ERROR!"
    );
  }

  // Check archived transactions
  console.log("\n\n📦 ARCHIVED TRANSACTIONS:");
  console.log("-".repeat(80));

  const archivedTransactions = db
    .prepare(
      `SELECT COUNT(*) as count, archived_at, 
              MIN(display_order) as min_order, 
              MAX(display_order) as max_order
       FROM cash_book 
       WHERE archived_at IS NOT NULL 
       GROUP BY archived_at`
    )
    .all();

  if (archivedTransactions.length > 0) {
    archivedTransactions.forEach((archive) => {
      console.log(`Archive: ${archive.archived_at}`);
      console.log(`  Count: ${archive.count}`);
      console.log(
        `  display_order range: ${archive.min_order} to ${archive.max_order}`
      );
    });
  } else {
    console.log("No archived transactions");
  }

  db.close();

  console.log("\n" + "=".repeat(80));
  console.log("✅ Analysis complete!");
  console.log("\nRECOMMENDATIONS:");
  console.log(
    "1. Transactions should be ordered by display_order DESC (highest = newest)"
  );
  console.log("2. Calculation should go from highest to lowest display_order");
  console.log("3. Frontend should display DESC order (newest on top)");
  console.log("=".repeat(80) + "\n");
} catch (error) {
  console.error("\n❌ ERROR:", error.message);
  process.exit(1);
}
