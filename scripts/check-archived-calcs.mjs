#!/usr/bin/env node
/**
 * Script to check if archived transactions need recalculation
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../database/gemiprintaio.db");

console.log("🔍 Checking Archived Transaction Calculations\n");

try {
  const db = new Database(dbPath, { readonly: true });

  // Get archived transactions
  const archives = db
    .prepare(
      `
      SELECT 
        archived_label,
        archived_at
      FROM cash_book
      WHERE archived_at IS NOT NULL
      GROUP BY archived_label, archived_at
      ORDER BY archived_at DESC
      LIMIT 1
    `
    )
    .all();

  if (archives.length === 0) {
    console.log("No archived transactions found.\n");
    db.close();
    process.exit(0);
  }

  const archive = archives[0];
  console.log(`Archive: "${archive.archived_label}"\n`);

  // Get first 10 transactions
  const txns = db
    .prepare(
      `
      SELECT id, tanggal, kategori_transaksi, keperluan, debit, kredit, 
             display_order, omzet, saldo, laba_bersih
      FROM cash_book 
      WHERE archived_label = ? AND archived_at = ?
      ORDER BY display_order ASC
      LIMIT 10
    `
    )
    .all(archive.archived_label, archive.archived_at);

  console.log("First 10 transactions with saldo progression:\n");

  let prevSaldo = 0;
  let expectedSaldo = 0;

  txns.forEach((txn, idx) => {
    expectedSaldo = prevSaldo + txn.debit - txn.kredit;
    const match = Math.abs(txn.saldo - expectedSaldo) < 0.01;

    console.log(`${idx + 1}. [${txn.kategori_transaksi}] ${txn.keperluan}`);
    console.log(`   Display Order: ${txn.display_order}`);
    console.log(`   Debit: ${txn.debit}, Kredit: ${txn.kredit}`);
    console.log(`   Previous Saldo: ${prevSaldo.toLocaleString("id-ID")}`);
    console.log(`   Expected Saldo: ${expectedSaldo.toLocaleString("id-ID")}`);
    console.log(
      `   Actual Saldo:   ${txn.saldo.toLocaleString("id-ID")} ${
        match ? "✅" : "❌ MISMATCH!"
      }`
    );
    console.log(
      `   Omzet: ${txn.omzet.toLocaleString(
        "id-ID"
      )}, Laba: ${txn.laba_bersih.toLocaleString("id-ID")}\n`
    );

    prevSaldo = txn.saldo;
  });

  // Check if calculations were done correctly when archived
  console.log("\n" + "=".repeat(60));
  console.log("\n💡 ANALYSIS:\n");
  console.log(
    "The archived transactions were calculated when they were ACTIVE."
  );
  console.log(
    "If values look wrong, it means they were calculated in the wrong"
  );
  console.log(
    "order before archiving. The fix we just applied will only affect"
  );
  console.log(
    "FUTURE calculations and the ORDER in which archived data is displayed.\n"
  );
  console.log("To fix existing archived data, you would need to:");
  console.log("1. Restore the archive");
  console.log("2. Recalculate (which will happen automatically)");
  console.log("3. Archive again\n");

  db.close();
  console.log("✅ Check complete!\n");
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
