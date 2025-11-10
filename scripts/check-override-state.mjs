import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../database/gemiprint.db");
const db = new Database(dbPath);

console.log("=== Testing override preservation ===\n");

console.log("Current state:");
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
    `#${i + 1} ${row.keperluan.padEnd(15)}: saldo=${row.saldo
      .toString()
      .padStart(10)}, override=${row.override_saldo}`
  );
});

console.log(
  "\nTo test: Add a new transaction via the UI and see if overrides are preserved!"
);
console.log("Expected: Transaction #2 and #3 should keep saldo = 5,000,000");

db.close();
