// Clear All Cash Book Transactions
// ⚠️ WARNING: This will delete ALL transactions in the cash_book table!
// Run: node clear-cashbook.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("⚠️  CLEAR ALL CASH BOOK TRANSACTIONS");
console.log("=".repeat(70));
console.log("\nℹ️  INFO: Script ini HANYA menghapus data di tabel cash_book.");
console.log(
  "ℹ️  Data lain (users, materials, customers, dll) TIDAK akan terhapus.\n"
);

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");

// Get current count
const countResult = db.prepare("SELECT COUNT(*) as count FROM cash_book").get();
const currentCount = countResult.count;

console.log(`\nCurrent transactions in cash_book: ${currentCount}`);

if (currentCount === 0) {
  console.log("\n✅ Cash book is already empty. Nothing to clear.");
  db.close();
  process.exit(0);
}

console.log("\n⚠️  WARNING: This action will DELETE ALL transactions!");
console.log("⚠️  This action CANNOT be undone!");
console.log("\nTo proceed, type 'DELETE ALL' (case-sensitive):");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("> ", (answer) => {
  rl.close();

  if (answer !== "DELETE ALL") {
    console.log("\n❌ Aborted. No changes made.");
    db.close();
    process.exit(0);
  }

  console.log("\n🗑️  Deleting all transactions...");

  try {
    const result = db.prepare("DELETE FROM cash_book").run();
    console.log(`\n✅ Successfully deleted ${result.changes} transaction(s).`);
    console.log("✅ Cash book is now empty.\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    db.close();
  }
});
