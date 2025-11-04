#!/usr/bin/env node
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n=== ANALISA URUTAN DATA TANGGAL 5 MEI ===\n");

// Ambil semua row tanggal 5 Mei dengan urutan seperti di database
const rows = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet, 
            created_at, display_order
     FROM cash_book 
     WHERE tanggal = '2025-05-05'
     ORDER BY tanggal ASC, created_at ASC`
  )
  .all();

console.log(`Ditemukan ${rows.length} row tanggal 5 Mei 2025\n`);

// Simulasi perhitungan manual
let prevSaldo = null;

// Cari saldo sebelum tanggal 5 Mei
const prevRow = db
  .prepare(
    `SELECT saldo 
     FROM cash_book 
     WHERE tanggal < '2025-05-05'
     ORDER BY tanggal DESC, created_at DESC
     LIMIT 1`
  )
  .get();

if (prevRow) {
  prevSaldo = prevRow.saldo;
  console.log(`Saldo sebelum 5 Mei: Rp ${prevSaldo.toLocaleString("id-ID")}\n`);
}

rows.forEach((row, idx) => {
  console.log(`\n--- Row ${idx + 1} ---`);
  console.log(`Keperluan: ${row.keperluan}`);
  console.log(`Kategori: ${row.kategori_transaksi}`);
  console.log(`Debit: Rp ${row.debit.toLocaleString("id-ID")}`);
  console.log(`Kredit: Rp ${row.kredit.toLocaleString("id-ID")}`);
  console.log(`Saldo (DB): Rp ${row.saldo.toLocaleString("id-ID")}`);
  console.log(`Display Order: ${row.display_order}`);
  console.log(`Created At: ${row.created_at}`);

  if (prevSaldo !== null) {
    const expectedSaldo = prevSaldo + row.debit - row.kredit;
    console.log(
      `Saldo (expected): Rp ${expectedSaldo.toLocaleString("id-ID")}`
    );

    if (Math.abs(expectedSaldo - row.saldo) > 0.01) {
      console.log(
        `⚠️  MISMATCH! Selisih: Rp ${(row.saldo - expectedSaldo).toLocaleString(
          "id-ID"
        )}`
      );
    }
  }

  prevSaldo = row.saldo;
});

// Cek row berikutnya (6 Mei)
console.log("\n\n=== Row tanggal 6 Mei (Pemasukan Cash) ===\n");

const nextRow = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet
     FROM cash_book 
     WHERE tanggal = '2025-05-06' AND keperluan LIKE '%Pemasukan Cash%'`
  )
  .get();

if (nextRow && prevSaldo !== null) {
  console.log(`Keperluan: ${nextRow.keperluan}`);
  console.log(`Debit: Rp ${nextRow.debit.toLocaleString("id-ID")}`);
  console.log(`Saldo (DB): Rp ${nextRow.saldo.toLocaleString("id-ID")}`);

  const expectedSaldo = prevSaldo + nextRow.debit;
  console.log(
    `Saldo (expected from prev): Rp ${expectedSaldo.toLocaleString("id-ID")}`
  );
  console.log(
    `⚠️  MISMATCH! Selisih: Rp ${(nextRow.saldo - expectedSaldo).toLocaleString(
      "id-ID"
    )}`
  );
}

// Cari apakah ada row yang mungkin ter-skip dalam perhitungan
console.log("\n\n=== CEK: Apakah ada row yang ter-double atau hilang? ===\n");

// Cari row dengan tanggal 5 Mei yang mungkin ada di antara Maklon dan Pemasukan Cash
const betweenRows = db
  .prepare(
    `SELECT keperluan, debit, kredit, created_at 
     FROM cash_book 
     WHERE tanggal = '2025-05-05'
     ORDER BY created_at DESC
     LIMIT 5`
  )
  .all();

console.log("5 row terakhir tanggal 5 Mei (urutan created_at DESC):");
betweenRows.forEach((r, i) => {
  console.log(
    `${i + 1}. ${r.keperluan} | Debit: ${r.debit} | Kredit: ${r.kredit}`
  );
});

db.close();
