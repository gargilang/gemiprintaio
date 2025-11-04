// Migrasi: Tambah kolom untuk archive dan display order
// Usage: node migrate-add-archive-and-order.mjs

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("🔧 Migrasi: Menambahkan kolom archive dan display_order...");

const db = new Database(DB_FILE);
db.pragma("foreign_keys = ON");

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(cash_book)").all();
  const columnNames = tableInfo.map((col) => col.name);

  // Add archived_at column if not exists
  if (!columnNames.includes("archived_at")) {
    db.prepare(
      `
      ALTER TABLE cash_book
      ADD COLUMN archived_at TEXT DEFAULT NULL
    `
    ).run();
    console.log("✅ Kolom 'archived_at' berhasil ditambahkan");
  } else {
    console.log("ℹ️  Kolom 'archived_at' sudah ada");
  }

  // Add archived_label column if not exists
  if (!columnNames.includes("archived_label")) {
    db.prepare(
      `
      ALTER TABLE cash_book
      ADD COLUMN archived_label TEXT DEFAULT NULL
    `
    ).run();
    console.log("✅ Kolom 'archived_label' berhasil ditambahkan");
  } else {
    console.log("ℹ️  Kolom 'archived_label' sudah ada");
  }

  // Add display_order column if not exists
  if (!columnNames.includes("display_order")) {
    db.prepare(
      `
      ALTER TABLE cash_book
      ADD COLUMN display_order INTEGER DEFAULT 0
    `
    ).run();
    console.log("✅ Kolom 'display_order' berhasil ditambahkan");

    // Initialize display_order based on tanggal and created_at
    console.log("🔄 Menginisialisasi display_order...");
    const rows = db
      .prepare("SELECT id FROM cash_book ORDER BY tanggal ASC, created_at ASC")
      .all();

    const updateStmt = db.prepare(
      "UPDATE cash_book SET display_order = ? WHERE id = ?"
    );

    rows.forEach((row, index) => {
      updateStmt.run(index, row.id);
    });

    console.log(`✅ display_order diinisialisasi untuk ${rows.length} rows`);
  } else {
    console.log("ℹ️  Kolom 'display_order' sudah ada");
  }

  console.log("\n✅ Migrasi selesai!");
} catch (error) {
  console.error("❌ Error saat migrasi:", error);
  process.exit(1);
} finally {
  db.close();
}
