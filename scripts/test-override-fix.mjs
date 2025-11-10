import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { recalculateCashbook } from "../src/lib/calculate-cashbook.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../database/gemiprint.db");
const db = new Database(dbPath);

console.log("=== BEFORE adding transaction #5 ===\n");

let rows = db
  .prepare(
    `SELECT id, keperluan, saldo, override_saldo 
     FROM keuangan 
     WHERE diarsipkan_pada IS NULL 
     ORDER BY urutan_tampilan ASC`
  )
  .all();

rows.forEach((row, i) => {
  console.log(
    `#${i + 1} ${row.keperluan}: saldo=${row.saldo}, override=${
      row.override_saldo
    }`
  );
});

console.log("\n=== Adding transaction #5 ===\n");

// Get max order
const maxOrder = db
  .prepare("SELECT MAX(urutan_tampilan) as max FROM keuangan")
  .get();
const newOrder = (maxOrder?.max || 0) + 1;

// Insert new transaction #5
db.prepare(
  `
  INSERT INTO keuangan (
    id, tanggal, kategori_transaksi, debit, kredit, keperluan,
    dibuat_pada, diperbarui_pada, urutan_tampilan
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`
).run(
  "test-tx-5",
  "2025-11-11",
  "OMZET",
  300000,
  0,
  "Transaction 5",
  new Date().toISOString(),
  new Date().toISOString(),
  newOrder
);

console.log("Transaction #5 added. Running recalculateCashbook...\n");

// Call the recalculate function
await recalculateCashbook(db);

console.log("\n=== AFTER recalculation ===\n");

rows = db
  .prepare(
    `SELECT id, keperluan, saldo, override_saldo 
     FROM keuangan 
     WHERE diarsipkan_pada IS NULL 
     ORDER BY urutan_tampilan ASC`
  )
  .all();

rows.forEach((row, i) => {
  console.log(
    `#${i + 1} ${row.keperluan}: saldo=${row.saldo}, override=${
      row.override_saldo
    }`
  );
});

// Check if overridden values stayed the same
console.log("\n=== VERIFICATION ===");
const tx2 = rows[1]; // Transaction #2 (Anwar)
const tx3 = rows[2]; // Transaction #3 (Suri)

if (tx2.saldo === 5000000 && tx2.override_saldo === 1) {
  console.log("✅ Transaction #2 override preserved (saldo = 5,000,000)");
} else {
  console.log(
    `❌ Transaction #2 override LOST (saldo = ${tx2.saldo}, expected 5,000,000)`
  );
}

if (tx3.saldo === 5000000 && tx3.override_saldo === 1) {
  console.log("✅ Transaction #3 override preserved (saldo = 5,000,000)");
} else {
  console.log(
    `❌ Transaction #3 override LOST (saldo = ${tx3.saldo}, expected 5,000,000)`
  );
}

// Cleanup: delete test transaction
db.prepare("DELETE FROM keuangan WHERE id = ?").run("test-tx-5");
console.log("\n✅ Test transaction #5 deleted");

db.close();
