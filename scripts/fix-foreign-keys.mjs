// Complete migration script to fix foreign key constraints
// This will recreate the barang table with correct foreign keys

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

console.log("🔄 Starting COMPLETE database migration...\n");
console.log("⚠️  This will fix foreign key constraints on barang table\n");

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

try {
  // Disable foreign keys temporarily
  db.pragma("foreign_keys = OFF");

  db.exec("BEGIN TRANSACTION");

  // Step 3: Create backup of barang table
  console.log("📋 Creating backup of barang table...");
  db.exec(`
    CREATE TABLE IF NOT EXISTS barang_backup AS
    SELECT * FROM barang
  `);

  const backupCount = db
    .prepare("SELECT COUNT(*) as count FROM barang_backup")
    .get();
  console.log(`✅ Backed up ${backupCount.count} rows from barang\n`);

  // Step 4: Drop old barang table
  console.log("🗑️  Dropping old barang table...");
  db.exec("DROP TABLE IF EXISTS barang");

  // Step 5: Create new barang table with correct foreign keys
  console.log("📝 Creating new barang table with correct foreign keys...");
  db.exec(`
    CREATE TABLE barang (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      deskripsi TEXT,
      kategori_id TEXT,
      subkategori_id TEXT,
      satuan_dasar TEXT NOT NULL,
      spesifikasi TEXT,
      jumlah_stok REAL DEFAULT 0,
      level_stok_minimum REAL DEFAULT 0,
      lacak_inventori_status INTEGER DEFAULT 1,
      butuh_dimensi_status INTEGER DEFAULT 0,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (kategori_id) REFERENCES kategori_barang(id) ON DELETE SET NULL,
      FOREIGN KEY (subkategori_id) REFERENCES subkategori_barang(id) ON DELETE SET NULL
    )
  `);

  // Step 6: Copy data back
  console.log("📋 Restoring data to new barang table...");
  db.exec(`
    INSERT INTO barang 
    SELECT * FROM barang_backup
  `);

  const newCount = db.prepare("SELECT COUNT(*) as count FROM barang").get();
  console.log(`✅ Restored ${newCount.count} rows to barang\n`);

  // Step 7: Drop backup table
  console.log("🗑️  Cleaning up backup table...");
  db.exec("DROP TABLE barang_backup");

  // Step 8: Re-enable foreign keys
  db.pragma("foreign_keys = ON");

  // Commit transaction
  db.exec("COMMIT");

  console.log("✅ Migration completed successfully!\n");

  // Step 9: Verify foreign keys
  console.log("🔍 Verifying new foreign keys on barang table:\n");
  const foreignKeys = db.pragma("foreign_key_list(barang)");
  if (foreignKeys.length > 0) {
    foreignKeys.forEach((fk) => {
      const status =
        fk.table === "kategori_barang" || fk.table === "subkategori_barang"
          ? "✅"
          : "❌";
      console.log(`  ${status} ${fk.from} -> ${fk.table}.${fk.to}`);
    });
  }

  console.log("\n📊 Migration Summary:");
  console.log(
    `   - Recreated barang table with correct foreign key constraints`
  );
  console.log(`   - Data preserved: ${newCount.count} rows`);
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
  "🎉 Migration complete! Foreign keys are now correctly pointing to the new table names.\n"
);
