#!/usr/bin/env node
/**
 * Script untuk FORCE RECALCULATE semua perhitungan cash_book
 * Masalah: Ada kesalahan perhitungan akumulasi dari awal yang menyebar ke semua row
 * Solusi: Hitung ulang SEMUA dari awal dengan algoritma yang sama persis dengan recalculateCashbook
 */
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

console.log("\n🔧 FORCE RECALCULATE CASH BOOK\n");
console.log("⚠️  Script ini akan menghitung ulang SEMUA kolom perhitungan");
console.log(
  "    dari awal mengikuti urutan DISPLAY_ORDER (urutan CSV import)\n"
);
console.log("    BUKAN urutan tanggal!\n");

const db = new Database(DB_FILE);
db.pragma("foreign_keys = ON");

// PENTING: Ambil semua row dengan urutan DISPLAY_ORDER DESC (highest = oldest/first in CSV)
// Ini memastikan perhitungan mengikuti urutan CSV, bukan urutan tanggal
const rows = db
  .prepare("SELECT * FROM cash_book ORDER BY display_order DESC")
  .all();

console.log(`📊 Total rows: ${rows.length}\n`);

const updateStmt = db.prepare(`
  UPDATE cash_book SET
    omzet = ?, biaya_operasional = ?, biaya_bahan = ?, saldo = ?, laba_bersih = ?,
    kasbon_anwar = ?, kasbon_suri = ?, kasbon_cahaya = ?, kasbon_dinil = ?,
    bagi_hasil_anwar = ?, bagi_hasil_suri = ?, bagi_hasil_gemi = ?
  WHERE id = ?
`);

let runningOmzet = 0;
let runningBiayaOps = 0;
let runningBiayaBahan = 0;
let runningSaldo = 0;
let runningLabaBersih = 0;
let runningKasbonAnwar = 0;
let runningKasbonSuri = 0;
let runningKasbonCahaya = 0;
let runningKasbonDinil = 0;
let runningBagiHasilAnwar = 0;
let runningBagiHasilSuri = 0;
let runningBagiHasilGemi = 0;
let prevLabaBersih = 0;

let updated = 0;

for (const row of rows) {
  const cat = row.kategori_transaksi;
  const debit = row.debit || 0;
  const kredit = row.kredit || 0;

  // OMZET: Akumulasi omzet dari OMZET atau PIUTANG
  if (!row.override_omzet) {
    if (cat === "OMZET" || cat === "PIUTANG") {
      runningOmzet += debit;
    }
  } else {
    runningOmzet = row.omzet;
  }

  // BIAYA OPERASIONAL: Akumulasi dari BIAYA atau TABUNGAN
  if (!row.override_biaya_operasional) {
    if (cat === "BIAYA" || cat === "TABUNGAN") {
      runningBiayaOps += kredit;
    }
  } else {
    runningBiayaOps = row.biaya_operasional;
  }

  // BIAYA BAHAN: Akumulasi dari SUPPLY atau HUTANG
  if (!row.override_biaya_bahan) {
    if (cat === "SUPPLY" || cat === "HUTANG") {
      runningBiayaBahan += kredit;
    }
  } else {
    runningBiayaBahan = row.biaya_bahan;
  }

  // SALDO: Debit dikurangi kredit, running balance
  if (!row.override_saldo) {
    runningSaldo += debit - kredit;
  } else {
    runningSaldo = row.saldo;
  }

  // LABA BERSIH: Omzet - Biaya Operasional - Biaya Bahan
  if (!row.override_laba_bersih) {
    runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;
  } else {
    runningLabaBersih = row.laba_bersih;
  }

  // KASBON ANWAR: Debit berkurang, Kredit bertambah
  if (!row.override_kasbon_anwar) {
    if (cat === "PRIBADI-A") {
      runningKasbonAnwar += kredit - debit;
    }
  } else {
    runningKasbonAnwar = row.kasbon_anwar;
  }

  // KASBON SURI: Debit berkurang, Kredit bertambah
  if (!row.override_kasbon_suri) {
    if (cat === "PRIBADI-S") {
      runningKasbonSuri += kredit - debit;
    }
  } else {
    runningKasbonSuri = row.kasbon_suri;
  }

  // KASBON CAHAYA: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
  if (!row.override_kasbon_cahaya) {
    const isCahaya = row.keperluan?.toLowerCase().includes("cahaya");
    if (isCahaya && (cat === "INVESTOR" || cat === "BIAYA")) {
      runningKasbonCahaya += kredit - debit;
    }
  } else {
    runningKasbonCahaya = row.kasbon_cahaya;
  }

  // KASBON DINIL: Kategori INVESTOR atau BIAYA, Debit berkurang, Kredit bertambah
  if (!row.override_kasbon_dinil) {
    const isDinil = row.keperluan?.toLowerCase().includes("dinil");
    if (isDinil && (cat === "INVESTOR" || cat === "BIAYA")) {
      runningKasbonDinil += kredit - debit;
    }
  } else {
    runningKasbonDinil = row.kasbon_dinil;
  }

  // BAGI HASIL ANWAR: (Laba Bersih / 3) - Kasbon Anwar
  if (!row.override_bagi_hasil_anwar) {
    runningBagiHasilAnwar = runningLabaBersih / 3 - runningKasbonAnwar;
  } else {
    runningBagiHasilAnwar = row.bagi_hasil_anwar;
  }

  // BAGI HASIL SURI: (Laba Bersih / 3) - Kasbon Suri
  if (!row.override_bagi_hasil_suri) {
    runningBagiHasilSuri = runningLabaBersih / 3 - runningKasbonSuri;
  } else {
    runningBagiHasilSuri = row.bagi_hasil_suri;
  }

  // BAGI HASIL GEMI: Increment (Laba Bersih / 3) + adjustment INVESTOR
  if (!row.override_bagi_hasil_gemi) {
    const labaIncrement = runningLabaBersih - prevLabaBersih;
    runningBagiHasilGemi += labaIncrement / 3;

    if (cat === "INVESTOR") {
      runningBagiHasilGemi += debit - kredit;
    }
  } else {
    runningBagiHasilGemi = row.bagi_hasil_gemi;
  }

  // Store previous Laba Bersih for next iteration
  prevLabaBersih = runningLabaBersih;

  updateStmt.run(
    runningOmzet,
    runningBiayaOps,
    runningBiayaBahan,
    runningSaldo,
    runningLabaBersih,
    runningKasbonAnwar,
    runningKasbonSuri,
    runningKasbonCahaya,
    runningKasbonDinil,
    runningBagiHasilAnwar,
    runningBagiHasilSuri,
    runningBagiHasilGemi,
    row.id
  );

  updated++;

  // Progress indicator
  if (updated % 50 === 0) {
    console.log(`⏳ Progress: ${updated}/${rows.length} rows...`);
  }
}

console.log(`\n✅ Selesai! ${updated} rows berhasil diperbarui\n`);

// Verifikasi hasil dengan melihat row yang bermasalah
console.log("🔍 Verifikasi row yang bermasalah:\n");

const maklon = db
  .prepare(
    `SELECT tanggal, keperluan, debit, kredit, saldo, omzet, laba_bersih
     FROM cash_book 
     WHERE keperluan LIKE '%Maklon X banner Astratech%'`
  )
  .get();

const pemasukan = db
  .prepare(
    `SELECT tanggal, keperluan, debit, kredit, saldo, omzet, laba_bersih
     FROM cash_book 
     WHERE keperluan LIKE '%Pemasukan Cash 6 Mei%'`
  )
  .get();

if (maklon && pemasukan) {
  console.log("📌 Maklon X banner Astratech (5 Mei):");
  console.log(`   Saldo: Rp ${maklon.saldo.toLocaleString("id-ID")}`);
  console.log(`   Omzet: Rp ${maklon.omzet.toLocaleString("id-ID")}`);
  console.log(`   Laba: Rp ${maklon.laba_bersih.toLocaleString("id-ID")}`);

  console.log("\n📌 Pemasukan Cash 6 Mei:");
  console.log(`   Debit: Rp ${pemasukan.debit.toLocaleString("id-ID")}`);
  console.log(`   Saldo: Rp ${pemasukan.saldo.toLocaleString("id-ID")}`);
  console.log(`   Omzet: Rp ${pemasukan.omzet.toLocaleString("id-ID")}`);
  console.log(`   Laba: Rp ${pemasukan.laba_bersih.toLocaleString("id-ID")}`);

  const expectedSaldo = maklon.saldo + pemasukan.debit;
  const selisihSaldo = pemasukan.saldo - expectedSaldo;

  console.log("\n🧮 Perhitungan:");
  console.log(
    `   Saldo Maklon + Debit Pemasukan = Rp ${expectedSaldo.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(
    `   Saldo Pemasukan (aktual) = Rp ${pemasukan.saldo.toLocaleString(
      "id-ID"
    )}`
  );
  console.log(`   Selisih = Rp ${selisihSaldo.toLocaleString("id-ID")}`);

  if (Math.abs(selisihSaldo) < 0.01) {
    console.log("\n✅ BENAR! Perhitungan sudah sesuai!");
  } else {
    console.log(
      "\n⚠️  Masih ada selisih. Kemungkinan ada transaksi lain di antara kedua row ini."
    );
  }
}

db.close();

console.log("\n✨ Proses selesai!\n");
