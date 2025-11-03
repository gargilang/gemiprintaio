// Migration: Fix Foreign Key References from profiles_old to profiles
// This script recreates tables that reference "profiles_old" to use "profiles" instead.
// Run: node migrate-fix-profiles-fk.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("MIGRATION: FIX FOREIGN KEY REFERENCES (profiles_old → profiles)");
console.log("=".repeat(70));

try {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");

  console.log("\n🔍 Checking if migration is needed...");

  // Check if profiles_old references exist
  const tables = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%profiles_old%'"
    )
    .all();

  if (tables.length === 0) {
    console.log(
      "✅ No profiles_old references found. Database is already up to date."
    );
    db.close();
    process.exit(0);
  }

  console.log(
    `\n📋 Found ${tables.length} tables with profiles_old references:`
  );
  tables.forEach((t) => console.log(`  - ${t.name}`));

  console.log(
    "\n⚠️  WARNING: This migration will recreate tables with corrected foreign keys."
  );
  console.log(
    "⚠️  All data will be preserved, but this operation cannot be undone."
  );
  console.log("\n� Starting migration in 2 seconds...");

  // Wait 2 seconds
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Start transaction
  db.prepare("BEGIN TRANSACTION").run();

  try {
    // 1. Disable foreign keys
    db.pragma("foreign_keys = OFF");

    console.log("\n� Step 1: Backing up data...");

    // Backup all data from affected tables
    const backups = {};
    for (const table of tables) {
      const data = db.prepare(`SELECT * FROM ${table.name}`).all();
      backups[table.name] = {
        data,
        sql: table.sql.replace(/"profiles_old"/g, "profiles"),
      };
      console.log(`  ✅ Backed up ${data.length} rows from ${table.name}`);
    }

    console.log("\n🗑️  Step 2: Dropping old tables...");

    // Drop all affected tables (in reverse order to handle FK dependencies)
    const dropOrder = Object.keys(backups).reverse();
    for (const tableName of dropOrder) {
      db.prepare(`DROP TABLE IF EXISTS ${tableName}`).run();
      console.log(`  ✅ Dropped ${tableName}`);
    }

    console.log("\n🔨 Step 3: Creating tables with corrected schema...");

    // Recreate tables with fixed schema
    for (const tableName of Object.keys(backups)) {
      db.exec(backups[tableName].sql);
      console.log(`  ✅ Created ${tableName}`);
    }

    console.log("\n📥 Step 4: Restoring data...");

    // Restore data
    for (const tableName of Object.keys(backups)) {
      const { data } = backups[tableName];
      if (data.length === 0) {
        console.log(`  ⏭️  ${tableName} - no data to restore`);
        continue;
      }

      const columns = Object.keys(data[0]);
      const columnList = columns.join(", ");
      const placeholders = columns.map(() => "?").join(", ");

      const stmt = db.prepare(
        `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`
      );

      for (const row of data) {
        stmt.run(...columns.map((col) => row[col]));
      }

      console.log(`  ✅ Restored ${data.length} rows to ${tableName}`);
    }

    // 2. Re-enable foreign keys
    db.pragma("foreign_keys = ON");

    // 3. Verify integrity
    console.log("\n🔍 Step 5: Verifying integrity...");
    const integrityResult = db.pragma("foreign_key_check");
    if (integrityResult.length > 0) {
      console.error("❌ Foreign key violations found:");
      console.error(integrityResult);
      throw new Error("Foreign key integrity check failed");
    }
    console.log("  ✅ Foreign key integrity verified");

    // Commit transaction
    db.prepare("COMMIT").run();

    console.log("\n" + "=".repeat(70));
    console.log("✅ MIGRATION COMPLETE");
    console.log("=".repeat(70));
    console.log(
      "\nAll foreign key references updated from profiles_old to profiles."
    );
    console.log("Database is now ready for normal operations.\n");
  } catch (error) {
    // Rollback on error
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
