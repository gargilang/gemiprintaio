#!/usr/bin/env node
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n=== RECALCULATE MANUAL - STEP BY STEP ===\n");

// Ambil semua row dan hitung ulang secara manual
const allRows = db
  .prepare(
    `SELECT id, tanggal, keperluan, kategori_transaksi, debit, kredit, saldo, omzet, 
            laba_bersih, display_order
     FROM cash_book 
     ORDER BY tanggal ASC, created_at ASC`
  )
  .all();

let runningSaldo = 0;
let runningOmzet = 0;
let runningBiayaOps = 0;
let runningBiayaBahan = 0;

console.log(`Total rows: ${allRows.length}\n`);

// Fokus ke area bermasalah
const problemArea = allRows.filter(
  (r) => r.tanggal >= "2025-05-04" && r.tanggal <= "2025-05-06"
);

console.log("=== AREA BERMASALAH (4-6 Mei) ===\n");

// Cari saldo awal sebelum 5 Mei
const beforeMay5 = allRows.filter((r) => r.tanggal < "2025-05-05");
if (beforeMay5.length > 0) {
  const lastBefore = beforeMay5[beforeMay5.length - 1];
  runningSaldo = lastBefore.saldo;
  runningOmzet = lastBefore.omzet;
  // Kita perlu biaya ops dan bahan untuk hitung laba
  const tempBiayaOps = allRows
    .filter((r) => r.tanggal < "2025-05-05")
    .reduce((sum, r) => {
      if (
        r.kategori_transaksi === "BIAYA" ||
        r.kategori_transaksi === "TABUNGAN"
      ) {
        return sum + r.kredit;
      }
      return sum;
    }, 0);

  const tempBiayaBahan = allRows
    .filter((r) => r.tanggal < "2025-05-05")
    .reduce((sum, r) => {
      if (
        r.kategori_transaksi === "SUPPLY" ||
        r.kategori_transaksi === "HUTANG"
      ) {
        return sum + r.kredit;
      }
      return sum;
    }, 0);

  runningBiayaOps = tempBiayaOps;
  runningBiayaBahan = tempBiayaBahan;

  console.log(`Starting from: ${lastBefore.tanggal} - ${lastBefore.keperluan}`);
  console.log(`Initial Saldo: Rp ${runningSaldo.toLocaleString("id-ID")}`);
  console.log(`Initial Omzet: Rp ${runningOmzet.toLocaleString("id-ID")}`);
  console.log(
    `Initial Biaya Ops: Rp ${runningBiayaOps.toLocaleString("id-ID")}`
  );
  console.log(
    `Initial Biaya Bahan: Rp ${runningBiayaBahan.toLocaleString("id-ID")}\n`
  );
}

problemArea.forEach((row, idx) => {
  const cat = row.kategori_transaksi;
  const debit = row.debit || 0;
  const kredit = row.kredit || 0;

  // Update running values
  if (cat === "OMZET" || cat === "PIUTANG") {
    runningOmzet += debit;
  }

  if (cat === "BIAYA" || cat === "TABUNGAN") {
    runningBiayaOps += kredit;
  }

  if (cat === "SUPPLY" || cat === "HUTANG") {
    runningBiayaBahan += kredit;
  }

  runningSaldo += debit - kredit;
  const runningLabaBersih = runningOmzet - runningBiayaOps - runningBiayaBahan;

  console.log(`\n--- ${idx + 1}. ${row.tanggal} ---`);
  console.log(`Keperluan: ${row.keperluan}`);
  console.log(`Kategori: ${cat}`);
  console.log(
    `Debit: Rp ${debit.toLocaleString(
      "id-ID"
    )} | Kredit: Rp ${kredit.toLocaleString("id-ID")}`
  );
  console.log(`\nDB Values:`);
  console.log(`  Saldo: Rp ${row.saldo.toLocaleString("id-ID")}`);
  console.log(`  Omzet: Rp ${row.omzet.toLocaleString("id-ID")}`);
  console.log(`  Laba: Rp ${row.laba_bersih.toLocaleString("id-ID")}`);
  console.log(`\nCalculated Values:`);
  console.log(`  Saldo: Rp ${runningSaldo.toLocaleString("id-ID")}`);
  console.log(`  Omzet: Rp ${runningOmzet.toLocaleString("id-ID")}`);
  console.log(`  Laba: Rp ${runningLabaBersih.toLocaleString("id-ID")}`);

  if (Math.abs(runningSaldo - row.saldo) > 0.01) {
    console.log(
      `\n⚠️  SALDO MISMATCH! Selisih: Rp ${(
        row.saldo - runningSaldo
      ).toLocaleString("id-ID")}`
    );
  }
  if (Math.abs(runningOmzet - row.omzet) > 0.01) {
    console.log(
      `⚠️  OMZET MISMATCH! Selisih: Rp ${(
        row.omzet - runningOmzet
      ).toLocaleString("id-ID")}`
    );
  }
  if (Math.abs(runningLabaBersih - row.laba_bersih) > 0.01) {
    console.log(
      `⚠️  LABA MISMATCH! Selisih: Rp ${(
        row.laba_bersih - runningLabaBersih
      ).toLocaleString("id-ID")}`
    );
  }
});

db.close();
