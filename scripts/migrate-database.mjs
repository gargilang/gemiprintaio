// Migration Script to rename tables in SQLite database
// This script will safely migrate from old table names to new ones

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "database", "gemiprint.db");
const BACKUP_PATH = path.join(
  __dirname,
  "..",
  "database",
  `gemiprint.db.backup-${Date.now()}`
);

console.log("🔄 Starting database migration...\n");

// Step 1: Create backup
console.log("📦 Creating backup...");
try {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log(`✅ Backup created at: ${BACKUP_PATH}\n`);
} catch (error) {
  console.error("❌ Failed to create backup:", error);
  process.exit(1);
}

// Step 2: Open database
let db;
try {
  db = new Database(DB_PATH);
  console.log("✅ Database opened successfully\n");
} catch (error) {
  console.error("❌ Failed to open database:", error);
  process.exit(1);
}

// Step 3: Check if old table exists
console.log("🔍 Checking for old table 'material_subcategories'...");
const tableExists = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='material_subcategories'"
  )
  .get();

if (!tableExists) {
  console.log("✅ Old table does not exist. No migration needed.\n");
  db.close();
  process.exit(0);
}

console.log(
  "⚠️  Old table 'material_subcategories' found. Starting migration...\n"
);

try {
  db.exec("BEGIN TRANSACTION");

  // Step 4: Create new table
  console.log("📝 Creating new table 'subkategori_barang'...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS subkategori_barang (
      id TEXT PRIMARY KEY,
      kategori_id TEXT NOT NULL,
      nama TEXT NOT NULL,
      urutan_tampilan INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE CASCADE
    )
  `);

  // Step 5: Check column names in old table
  console.log("🔍 Checking old table structure...");
  const oldTableInfo = db.pragma("table_info(material_subcategories)");
  console.log("Old table columns:", oldTableInfo.map((c) => c.name).join(", "));

  // Determine the correct column name for kategori_id
  const hasKategoriId = oldTableInfo.some((c) => c.name === "kategori_id");
  const hasCategoryId = oldTableInfo.some((c) => c.name === "category_id");

  const categoryColumn = hasKategoriId
    ? "kategori_id"
    : hasCategoryId
    ? "category_id"
    : "kategori_id";

  console.log(`Using column: ${categoryColumn} for kategori_id\n`);

  // Step 6: Copy data
  console.log("📋 Copying data to new table...");
  const copyQuery = `
    INSERT OR IGNORE INTO subkategori_barang (id, kategori_id, nama, urutan_tampilan, dibuat_pada, diperbarui_pada)
    SELECT id, ${categoryColumn} as kategori_id, nama, urutan_tampilan, 
           COALESCE(dibuat_pada, datetime('now')),
           COALESCE(diperbarui_pada, datetime('now'))
    FROM material_subcategories
  `;

  const result = db.prepare(copyQuery).run();
  console.log(`✅ Copied ${result.changes} rows\n`);

  // Step 7: Update barang table foreign key references
  console.log("🔗 Checking barang table for foreign key updates...");
  const barangTableInfo = db.pragma("table_info(barang)");
  console.log(
    "Barang table columns:",
    barangTableInfo.map((c) => c.name).join(", ")
  );

  // Check if barang table uses subkategori_id
  const hasSubkategoriId = barangTableInfo.some(
    (c) => c.name === "subkategori_id"
  );

  if (hasSubkategoriId) {
    console.log("✅ Barang table already uses 'subkategori_id'\n");
  } else {
    console.log(
      "⚠️  Barang table needs column update (manual check required)\n"
    );
  }

  // Step 8: Drop old table
  console.log("🗑️  Dropping old table 'material_subcategories'...");
  db.exec("DROP TABLE material_subcategories");

  // Step 9: Verify
  const newCount = db
    .prepare("SELECT COUNT(*) as count FROM subkategori_barang")
    .get();
  console.log(`✅ New table has ${newCount.count} rows\n`);

  // Commit transaction
  db.exec("COMMIT");
  console.log("✅ Migration completed successfully!\n");

  // Show summary
  console.log("📊 Migration Summary:");
  console.log(`   - Old table: material_subcategories (DELETED)`);
  console.log(`   - New table: subkategori_barang (${newCount.count} rows)`);
  console.log(`   - Backup: ${BACKUP_PATH}`);
  console.log(
    "\n💡 If something goes wrong, restore from backup using:\n   cp " +
      BACKUP_PATH +
      " " +
      DB_PATH
  );
} catch (error) {
  console.error("\n❌ Migration failed:", error);
  try {
    db.exec("ROLLBACK");
    console.log("🔄 Transaction rolled back");
  } catch (rollbackError) {
    console.error("❌ Rollback failed:", rollbackError);
  }

  console.log("\n💡 Restoring from backup...");
  db.close();
  try {
    fs.copyFileSync(BACKUP_PATH, DB_PATH);
    console.log("✅ Database restored from backup");
  } catch (restoreError) {
    console.error("❌ Failed to restore backup:", restoreError);
  }

  process.exit(1);
}

db.close();
console.log("\n✅ Database connection closed");
console.log(
  "🎉 Migration complete! You can now use the app with the new schema.\n"
);
