#!/usr/bin/env node
/**
 * Script untuk melihat daftar arsip yang ada di database
 * Berguna untuk debugging dan melihat arsip mana yang bisa di-restore
 */
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n📦 DAFTAR ARSIP BUKU KEUANGAN\n");

// Ambil daftar arsip yang unik
const archives = db
  .prepare(
    `
  SELECT 
    archived_label, 
    archived_at,
    MIN(tanggal) as start_date,
    MAX(tanggal) as end_date,
    COUNT(*) as transaction_count
  FROM cash_book
  WHERE archived_at IS NOT NULL
  GROUP BY archived_label, archived_at
  ORDER BY archived_at DESC
`
  )
  .all();

if (archives.length === 0) {
  console.log("Tidak ada arsip.");
} else {
  archives.forEach((archive, idx) => {
    console.log(`${idx + 1}. ${archive.archived_label}`);
    console.log(
      `   Ditutup pada: ${new Date(archive.archived_at).toLocaleString(
        "id-ID"
      )}`
    );
    console.log(`   Periode: ${archive.start_date} s/d ${archive.end_date}`);
    console.log(`   Jumlah transaksi: ${archive.transaction_count}`);
    console.log("");
  });
}

// Hitung transaksi aktif
const activeCount = db
  .prepare("SELECT COUNT(*) as count FROM cash_book WHERE archived_at IS NULL")
  .get();

console.log(`\n📊 Transaksi Aktif: ${activeCount.count}\n`);

db.close();
