#!/usr/bin/env node
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n=== Mencari data row 'Maklon X banner Astratech' ===\n");

const maklon = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet, laba_bersih
     FROM cash_book 
     WHERE keperluan LIKE '%Maklon X banner Astratech%'`
  )
  .get();

if (maklon) {
  console.log("Row Maklon ditemukan:");
  console.log(JSON.stringify(maklon, null, 2));
  console.log("\n--- Raw bytes kategori_transaksi ---");
  const bytes = Buffer.from(maklon.kategori_transaksi);
  console.log("Hex:", bytes.toString("hex"));
  console.log("Length:", maklon.kategori_transaksi.length);
  console.log(
    "Chars:",
    [...maklon.kategori_transaksi].map((c) => c.charCodeAt(0))
  );
}

console.log("\n=== Mencari data row 'Pemasukan Cash 6 Mei' ===\n");

const pemasukan = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet, laba_bersih
     FROM cash_book 
     WHERE keperluan LIKE '%Pemasukan Cash 6 Mei%'`
  )
  .get();

if (pemasukan) {
  console.log("Row Pemasukan ditemukan:");
  console.log(JSON.stringify(pemasukan, null, 2));
  console.log("\n--- Raw bytes kategori_transaksi ---");
  const bytes = Buffer.from(pemasukan.kategori_transaksi);
  console.log("Hex:", bytes.toString("hex"));
  console.log("Length:", pemasukan.kategori_transaksi.length);
  console.log(
    "Chars:",
    [...pemasukan.kategori_transaksi].map((c) => c.charCodeAt(0))
  );
}

// Cari row dengan tanggal 5-6 Mei 2025
console.log("\n=== Semua row tanggal 5-6 Mei 2025 ===\n");

const mayRows = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet, laba_bersih
     FROM cash_book 
     WHERE tanggal IN ('2025-05-05', '2025-05-06')
     ORDER BY tanggal ASC, created_at ASC`
  )
  .all();

mayRows.forEach((row, idx) => {
  console.log(`\n--- Row ${idx + 1} ---`);
  console.log(JSON.stringify(row, null, 2));
  console.log(
    "Kategori bytes:",
    Buffer.from(row.kategori_transaksi).toString("hex")
  );
});

// Hitung ulang manual untuk row Pemasukan
if (maklon && pemasukan) {
  console.log("\n=== Perhitungan Manual ===");
  console.log(`Saldo Maklon: Rp ${maklon.saldo.toLocaleString("id-ID")}`);
  console.log(`Debit Pemasukan: Rp ${pemasukan.debit.toLocaleString("id-ID")}`);
  console.log(
    `Saldo Pemasukan (seharusnya): Rp ${(
      maklon.saldo + pemasukan.debit
    ).toLocaleString("id-ID")}`
  );
  console.log(
    `Saldo Pemasukan (aktual): Rp ${pemasukan.saldo.toLocaleString("id-ID")}`
  );
  console.log(
    `Selisih: Rp ${(
      pemasukan.saldo -
      (maklon.saldo + pemasukan.debit)
    ).toLocaleString("id-ID")}`
  );
}

// Cek semua row dengan kategori yang mengandung karakter non-standar
console.log("\n=== Mencari kategori dengan karakter non-ASCII ===\n");

const allRows = db
  .prepare("SELECT id, tanggal, keperluan, kategori_transaksi FROM cash_book")
  .all();

const suspicious = allRows.filter((row) => {
  const bytes = Buffer.from(row.kategori_transaksi);
  return bytes.some((b) => b > 127 || b < 32);
});

if (suspicious.length > 0) {
  console.log(`Ditemukan ${suspicious.length} row dengan karakter non-ASCII:`);
  suspicious.forEach((row) => {
    console.log(`\nTanggal: ${row.tanggal}, Keperluan: ${row.keperluan}`);
    console.log(`Kategori: "${row.kategori_transaksi}"`);
    console.log(`Hex: ${Buffer.from(row.kategori_transaksi).toString("hex")}`);
  });
} else {
  console.log("Tidak ada row dengan karakter non-ASCII.");
}

db.close();
