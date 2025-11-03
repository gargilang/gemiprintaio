// Migration: Add manual override flags to cash_book
// This allows admin to manually override calculated values for specific entries
// Run: node migrate-add-override-flags.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("MIGRATION: ADD MANUAL OVERRIDE FLAGS");
console.log("=".repeat(70));

try {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  console.log("\n🔍 Checking if migration is needed...");

  // Check if columns already exist
  const columns = db.prepare("PRAGMA table_info(cash_book)").all();
  const hasOverrideFlags = columns.some((col) => col.name === "override_saldo");

  if (hasOverrideFlags) {
    console.log("✅ Override flags already exist. Migration not needed.");
    db.close();
    process.exit(0);
  }

  console.log("\n📝 Adding override flags to cash_book...");

  db.prepare("BEGIN TRANSACTION").run();

  try {
    // Add override flag columns
    db.exec(`
      ALTER TABLE cash_book ADD COLUMN override_saldo INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_omzet INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_biaya_operasional INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_biaya_bahan INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_laba_bersih INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_kasbon_anwar INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_kasbon_suri INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_kasbon_cahaya INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_kasbon_dinil INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_bagi_hasil_anwar INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_bagi_hasil_suri INTEGER DEFAULT 0;
      ALTER TABLE cash_book ADD COLUMN override_bagi_hasil_gemi INTEGER DEFAULT 0;
    `);

    db.prepare("COMMIT").run();

    console.log("\n✅ Migration complete!");
    console.log("\nOverride flags added:");
    console.log("  - override_saldo");
    console.log("  - override_omzet");
    console.log("  - override_biaya_operasional");
    console.log("  - override_biaya_bahan");
    console.log("  - override_laba_bersih");
    console.log("  - override_kasbon_anwar");
    console.log("  - override_kasbon_suri");
    console.log("  - override_kasbon_cahaya");
    console.log("  - override_kasbon_dinil");
    console.log("  - override_bagi_hasil_anwar");
    console.log("  - override_bagi_hasil_suri");
    console.log("  - override_bagi_hasil_gemi");
    console.log(
      "\nWhen override flag = 1, recalculation will skip that specific field."
    );
    console.log(
      "This allows admin to manually set values that won't be overwritten.\n"
    );
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error;
  } finally {
    db.close();
  }
} catch (error) {
  console.error("\n❌ Migration failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
