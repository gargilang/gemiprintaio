#!/usr/bin/env node

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, "..", "database", "gemiprint.db");
const SCHEMA_PATH = join(__dirname, "..", "database", "sqlite-schema.sql");

console.log("🚀 Initializing database...");
console.log("📍 DB Path:", DB_PATH);
console.log("📍 Schema Path:", SCHEMA_PATH);

try {
  // Read schema file
  const schema = readFileSync(SCHEMA_PATH, "utf-8");

  // Open database
  const db = new Database(DB_PATH);

  console.log(`\n📝 Executing schema file...`);

  // Execute entire schema at once
  try {
    db.exec(schema);
    console.log(`✅ Schema executed successfully`);
  } catch (error) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("UNIQUE constraint failed") ||
      error.message.includes("no such table")
    ) {
      console.log(`⚠️  Some statements were skipped (already exists)`);
    } else {
      throw error;
    }
  }

  // Verify data
  console.log("\n🔍 Verifying data...");
  const categories = db
    .prepare("SELECT COUNT(*) as count FROM material_categories")
    .get();
  const subcategories = db
    .prepare("SELECT COUNT(*) as count FROM material_subcategories")
    .get();
  const units = db
    .prepare("SELECT COUNT(*) as count FROM material_units")
    .get();
  const specs = db
    .prepare("SELECT COUNT(*) as count FROM material_quick_specs")
    .get();

  console.log(`✅ Categories: ${categories.count}`);
  console.log(`✅ Subcategories: ${subcategories.count}`);
  console.log(`✅ Units: ${units.count}`);
  console.log(`✅ Quick Specs: ${specs.count}`);

  db.close();
  console.log("\n🎉 Database initialized successfully!\n");
} catch (error) {
  console.error("❌ Error initializing database:", error);
  process.exit(1);
}
