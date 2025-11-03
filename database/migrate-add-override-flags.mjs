// Migrasi: Tambah kolom override flags untuk manual editing
// Usage: node migrate-add-override-flags.mjs

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("🔧 Migrasi: Menambahkan kolom override flags...");

const db = new Database(DB_FILE);
db.pragma("foreign_keys = ON");

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(cash_book)").all();
  const columnNames = tableInfo.map((col) => col.name);

  const overrideFields = [
    "override_saldo",
    "override_omzet",
    "override_biaya_operasional",
    "override_biaya_bahan",
    "override_laba_bersih",
    "override_kasbon_anwar",
    "override_kasbon_suri",
    "override_kasbon_cahaya",
    "override_kasbon_dinil",
    "override_bagi_hasil_anwar",
    "override_bagi_hasil_suri",
    "override_bagi_hasil_gemi",
  ];

  let added = 0;
  for (const field of overrideFields) {
    if (!columnNames.includes(field)) {
      db.prepare(
        `ALTER TABLE cash_book ADD COLUMN ${field} INTEGER DEFAULT 0`
      ).run();
      console.log(`✅ Kolom '${field}' berhasil ditambahkan`);
      added++;
    } else {
      console.log(`ℹ️  Kolom '${field}' sudah ada`);
    }
  }

  if (added > 0) {
    console.log(`\n✅ Migrasi selesai! ${added} kolom override ditambahkan.`);
  } else {
    console.log("\n✅ Semua kolom override sudah ada.");
  }
} catch (error) {
  console.error("❌ Error saat migrasi:", error);
  process.exit(1);
} finally {
  db.close();
}
