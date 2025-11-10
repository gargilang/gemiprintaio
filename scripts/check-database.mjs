// Check all tables in database
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "..", "database", "gemiprint.db");

const db = new Database(DB_PATH);

console.log("\n📊 Tables in database:\n");
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();

tables.forEach((t) => console.log("  - " + t.name));

console.log("\n🔍 Checking for any reference to 'material' prefix:\n");

// Check in table names
const materialTables = tables.filter((t) =>
  t.name.toLowerCase().includes("material")
);
if (materialTables.length > 0) {
  console.log("❌ Found tables with 'material' prefix:");
  materialTables.forEach((t) => console.log("  - " + t.name));
} else {
  console.log("✅ No tables with 'material' prefix found");
}

// Check for indexes
console.log("\n🔍 Checking indexes:\n");
const indexes = db
  .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index'")
  .all();

const materialIndexes = indexes.filter(
  (i) => i.sql && i.sql.toLowerCase().includes("material")
);
if (materialIndexes.length > 0) {
  console.log("❌ Found indexes referencing 'material':");
  materialIndexes.forEach((i) => console.log(`  - ${i.name} on ${i.tbl_name}`));
} else {
  console.log("✅ No indexes with 'material' reference found");
}

// Check for triggers
console.log("\n🔍 Checking triggers:\n");
const triggers = db
  .prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'")
  .all();

const materialTriggers = triggers.filter(
  (t) => t.sql && t.sql.toLowerCase().includes("material")
);
if (materialTriggers.length > 0) {
  console.log("❌ Found triggers referencing 'material':");
  materialTriggers.forEach((t) =>
    console.log(`  - ${t.name} on ${t.tbl_name}`)
  );
} else {
  console.log("✅ No triggers with 'material' reference found");
}

// Check barang table structure
console.log("\n🔍 Checking 'barang' table structure:\n");
const barangInfo = db.pragma("table_info(barang)");
console.log("Columns:");
barangInfo.forEach((col) => {
  console.log(`  - ${col.name} (${col.type})`);
});

// Check foreign keys on barang
console.log("\n🔍 Foreign keys on 'barang' table:\n");
const foreignKeys = db.pragma("foreign_key_list(barang)");
if (foreignKeys.length > 0) {
  foreignKeys.forEach((fk) => {
    console.log(`  - ${fk.from} -> ${fk.table}.${fk.to}`);
  });
} else {
  console.log("  No foreign keys found");
}

db.close();
console.log("\n✅ Database check complete!\n");
