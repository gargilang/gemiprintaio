import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../database/gemiprint.db");
const db = new Database(dbPath);

console.log("Testing override flag reading...\n");

// Fetch transactions with override flags
const rows = db
  .prepare(
    `SELECT id, tanggal, keperluan, saldo, override_saldo 
     FROM keuangan 
     WHERE diarsipkan_pada IS NULL 
     ORDER BY urutan_tampilan ASC`
  )
  .all();

rows.forEach((row) => {
  console.log(`Transaction: ${row.keperluan}`);
  console.log(`  saldo: ${row.saldo}`);
  console.log(`  override_saldo: ${row.override_saldo}`);
  console.log(`  Type of override_saldo: ${typeof row.override_saldo}`);
  console.log(`  Truthy check: ${!!row.override_saldo}`);
  console.log(`  !row.override_saldo: ${!row.override_saldo}`);
  console.log(`  Should update saldo? ${!row.override_saldo}`);
  console.log("");
});

db.close();
