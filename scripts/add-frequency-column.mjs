import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "..", "database", "gemiprint.db");

console.log("🔧 Adding frekuensi_terjual column to barang table...");

const db = new Database(dbPath);

try {
  // Check if column already exists
  const columns = db.pragma("table_info(barang)");
  const columnExists = columns.some((col) => col.name === "frekuensi_terjual");

  if (columnExists) {
    console.log("✅ Column frekuensi_terjual already exists!");
  } else {
    // Add the column
    db.exec(`
      ALTER TABLE barang 
      ADD COLUMN frekuensi_terjual INTEGER DEFAULT 0;
    `);

    console.log("✅ Column frekuensi_terjual added successfully!");

    // Initialize frequencies based on existing sales
    const result = db.exec(`
      UPDATE barang
      SET frekuensi_terjual = (
        SELECT COUNT(DISTINCT ip.penjualan_id)
        FROM item_penjualan ip
        WHERE ip.barang_id = barang.id
      );
    `);

    console.log("✅ Initialized frequencies from existing sales data!");
  }

  db.close();
  console.log("✅ Migration completed successfully!");
} catch (error) {
  console.error("❌ Migration failed:", error);
  db.close();
  process.exit(1);
}
