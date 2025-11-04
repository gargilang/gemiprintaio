#!/usr/bin/env node
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n=== TRANSAKSI ANTARA MAKLON DAN PEMASUKAN CASH 6 MEI ===\n");

// Cari semua transaksi tanggal 5 Mei setelah "Maklon X banner Astratech"
const all5May = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, 
            created_at, display_order
     FROM cash_book 
     WHERE tanggal = '2025-05-05'
     ORDER BY tanggal ASC, created_at ASC`
  )
  .all();

console.log(`Total transaksi tanggal 5 Mei: ${all5May.length}\n`);

let foundMaklon = false;
let afterMaklon = [];

all5May.forEach((row) => {
  if (row.keperluan.includes("Maklon X banner Astratech")) {
    foundMaklon = true;
    console.log("✅ Ditemukan: Maklon X banner Astratech");
    console.log(`   Saldo: Rp ${row.saldo.toLocaleString("id-ID")}\n`);
  } else if (foundMaklon) {
    afterMaklon.push(row);
  }
});

console.log(
  `Transaksi setelah Maklon (masih tanggal 5 Mei): ${afterMaklon.length}\n`
);

afterMaklon.forEach((row, idx) => {
  console.log(`${idx + 1}. ${row.keperluan}`);
  console.log(`   Kategori: ${row.kategori_transaksi}`);
  console.log(
    `   Debit: Rp ${row.debit.toLocaleString(
      "id-ID"
    )} | Kredit: Rp ${row.kredit.toLocaleString("id-ID")}`
  );
  console.log(`   Saldo: Rp ${row.saldo.toLocaleString("id-ID")}\n`);
});

// Cari transaksi tanggal 6 Mei SEBELUM Pemasukan Cash
const all6May = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, 
            created_at, display_order
     FROM cash_book 
     WHERE tanggal = '2025-05-06'
     ORDER BY tanggal ASC, created_at ASC`
  )
  .all();

let foundPemasukan = false;
let beforePemasukan = [];

all6May.forEach((row) => {
  if (row.keperluan.includes("Pemasukan Cash 6 Mei")) {
    foundPemasukan = true;
    console.log("✅ Ditemukan: Pemasukan Cash 6 Mei");
    console.log(`   Saldo: Rp ${row.saldo.toLocaleString("id-ID")}\n`);
  } else if (!foundPemasukan) {
    beforePemasukan.push(row);
  }
});

console.log(
  `Transaksi sebelum Pemasukan Cash (tanggal 6 Mei): ${beforePemasukan.length}\n`
);

if (beforePemasukan.length > 0) {
  console.log("⚠️  ADA TRANSAKSI DI ANTARA MAKLON DAN PEMASUKAN CASH!\n");
}

// Hitung total perubahan saldo dari semua transaksi di antara
let totalChange = 0;

console.log("Transaksi di antara Maklon dan Pemasukan Cash:\n");

afterMaklon.concat(beforePemasukan).forEach((row, idx) => {
  const change = row.debit - row.kredit;
  totalChange += change;

  console.log(`${idx + 1}. ${row.tanggal} - ${row.keperluan}`);
  console.log(
    `   Perubahan Saldo: ${change >= 0 ? "+" : ""}Rp ${change.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(`   Running Total: Rp ${totalChange.toLocaleString("id-ID")}\n`);
});

console.log("===== KESIMPULAN =====\n");

const maklon = db
  .prepare(
    `SELECT saldo FROM cash_book 
     WHERE keperluan LIKE '%Maklon X banner Astratech%'`
  )
  .get();

const pemasukan = db
  .prepare(
    `SELECT debit, saldo FROM cash_book 
     WHERE keperluan LIKE '%Pemasukan Cash 6 Mei%'`
  )
  .get();

if (maklon && pemasukan) {
  console.log(`Saldo Maklon: Rp ${maklon.saldo.toLocaleString("id-ID")}`);
  console.log(
    `Total perubahan di antara: Rp ${totalChange.toLocaleString("id-ID")}`
  );
  console.log(`Debit Pemasukan: Rp ${pemasukan.debit.toLocaleString("id-ID")}`);
  console.log(
    `\nSeharusnya Saldo Pemasukan: Rp ${(
      maklon.saldo +
      totalChange +
      pemasukan.debit
    ).toLocaleString("id-ID")}`
  );
  console.log(
    `Saldo Pemasukan (aktual): Rp ${pemasukan.saldo.toLocaleString("id-ID")}`
  );

  const expected = maklon.saldo + totalChange + pemasukan.debit;
  const selisih = pemasukan.saldo - expected;

  if (Math.abs(selisih) < 0.01) {
    console.log(
      "\n✅ BENAR! Perhitungan sudah sesuai dengan transaksi di antara!"
    );
  } else {
    console.log(
      `\n⚠️  Masih ada selisih: Rp ${selisih.toLocaleString("id-ID")}`
    );
  }
}

db.close();
