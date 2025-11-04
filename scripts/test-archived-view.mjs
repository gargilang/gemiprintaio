#!/usr/bin/env node
/**
 * Test script for archived transactions viewing and delete-all functionality
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../database/gemiprintaio.db");

console.log("🧪 Testing Archived Transactions & Delete All\n");
console.log(`Database: ${dbPath}\n`);

try {
  const db = new Database(dbPath, { readonly: true });

  // Check active transactions
  const activeCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM cash_book WHERE archived_at IS NULL`
    )
    .get();

  console.log(`📊 Active Transactions: ${activeCount.count}\n`);

  // Check archived transactions
  const archivedCount = db
    .prepare(
      `SELECT COUNT(*) as count FROM cash_book WHERE archived_at IS NOT NULL`
    )
    .get();

  console.log(`📦 Archived Transactions: ${archivedCount.count}\n`);

  if (archivedCount.count > 0) {
    // List all archived groups
    const archives = db
      .prepare(
        `
        SELECT 
          archived_label,
          COUNT(*) as count,
          MIN(tanggal) as start_date,
          MAX(tanggal) as end_date,
          archived_at
        FROM cash_book
        WHERE archived_at IS NOT NULL
        GROUP BY archived_label, archived_at
        ORDER BY archived_at DESC
      `
      )
      .all();

    console.log("📚 Archived Groups:\n");
    archives.forEach((archive, idx) => {
      console.log(`${idx + 1}. ${archive.archived_label}`);
      console.log(`   Count: ${archive.count} transactions`);
      console.log(`   Period: ${archive.start_date} to ${archive.end_date}`);
      console.log(`   Archived at: ${archive.archived_at}\n`);
    });

    // Test viewing first archive with ASC order
    const firstArchive = archives[0];
    console.log(`🔍 Testing Archive View: "${firstArchive.archived_label}"\n`);

    const archivedTxns = db
      .prepare(
        `
        SELECT id, tanggal, kategori_transaksi, keperluan, debit, kredit, 
               display_order, omzet, saldo, laba_bersih,
               kasbon_anwar, kasbon_suri, bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
        FROM cash_book 
        WHERE archived_label = ? AND archived_at = ?
        ORDER BY display_order ASC, created_at ASC
        LIMIT 5
      `
      )
      .all(firstArchive.archived_label, firstArchive.archived_at);

    console.log("First 5 transactions (oldest first - ASC order):\n");
    archivedTxns.forEach((txn, idx) => {
      console.log(
        `${idx + 1}. [${txn.kategori_transaksi}] ${txn.keperluan} (${
          txn.tanggal
        })`
      );
      console.log(`   Display Order: ${txn.display_order}`);
      console.log(`   Debit: ${txn.debit}, Kredit: ${txn.kredit}`);
      console.log(
        `   Omzet: ${txn.omzet}, Saldo: ${txn.saldo}, Laba: ${txn.laba_bersih}`
      );
      console.log(`   Kasbon A: ${txn.kasbon_anwar}, S: ${txn.kasbon_suri}`);
      console.log(
        `   Bagi Hasil A: ${txn.bagi_hasil_anwar}, S: ${txn.bagi_hasil_suri}, G: ${txn.bagi_hasil_gemi}\n`
      );
    });

    // Get last transaction for summary
    const lastTxn = db
      .prepare(
        `
        SELECT omzet, biaya_operasional, biaya_bahan, saldo, laba_bersih,
               kasbon_anwar, kasbon_suri, kasbon_cahaya, kasbon_dinil,
               bagi_hasil_anwar, bagi_hasil_suri, bagi_hasil_gemi
        FROM cash_book 
        WHERE archived_label = ? AND archived_at = ?
        ORDER BY display_order DESC, created_at DESC
        LIMIT 1
      `
      )
      .get(firstArchive.archived_label, firstArchive.archived_at);

    console.log(
      "📊 SUMMARY (from last transaction - highest accumulated values):\n"
    );
    console.log(`Omzet:             ${lastTxn.omzet.toLocaleString("id-ID")}`);
    console.log(
      `Biaya Operasional: ${lastTxn.biaya_operasional.toLocaleString("id-ID")}`
    );
    console.log(
      `Biaya Bahan:       ${lastTxn.biaya_bahan.toLocaleString("id-ID")}`
    );
    console.log(`Saldo:             ${lastTxn.saldo.toLocaleString("id-ID")}`);
    console.log(
      `Laba Bersih:       ${lastTxn.laba_bersih.toLocaleString("id-ID")}`
    );
    console.log(
      `Kasbon Anwar:      ${lastTxn.kasbon_anwar.toLocaleString("id-ID")}`
    );
    console.log(
      `Kasbon Suri:       ${lastTxn.kasbon_suri.toLocaleString("id-ID")}`
    );
    console.log(
      `Kasbon Cahaya:     ${lastTxn.kasbon_cahaya.toLocaleString("id-ID")}`
    );
    console.log(
      `Kasbon Dinil:      ${lastTxn.kasbon_dinil.toLocaleString("id-ID")}`
    );
    console.log(
      `Bagi Hasil Anwar:  ${lastTxn.bagi_hasil_anwar.toLocaleString("id-ID")}`
    );
    console.log(
      `Bagi Hasil Suri:   ${lastTxn.bagi_hasil_suri.toLocaleString("id-ID")}`
    );
    console.log(
      `Bagi Hasil Gemi:   ${lastTxn.bagi_hasil_gemi.toLocaleString("id-ID")}`
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n🗑️  DELETE ALL TEST:\n");
  console.log(`If 'Delete All' is executed, it will delete:`);
  console.log(`  ✅ ${activeCount.count} active transaction(s)`);
  console.log(
    `  ❌ ${archivedCount.count} archived transaction(s) will be PRESERVED\n`
  );

  db.close();

  console.log("✅ Test complete!\n");
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
