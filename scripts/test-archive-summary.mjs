#!/usr/bin/env node
/**
 * Script untuk test summary card pada arsip
 * Menampilkan nilai terakhir dari arsip untuk memverifikasi logika summary
 */
import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

console.log("\n📊 TEST SUMMARY CARD ARSIP\n");

// Ambil arsip terakhir
const lastArchive = db
  .prepare(
    `
  SELECT 
    archived_label, 
    archived_at
  FROM cash_book
  WHERE archived_at IS NOT NULL
  GROUP BY archived_label, archived_at
  ORDER BY archived_at DESC
  LIMIT 1
`
  )
  .get();

if (!lastArchive) {
  console.log("❌ Tidak ada arsip ditemukan");
  db.close();
  process.exit(0);
}

console.log(`📦 Arsip: ${lastArchive.archived_label}`);
console.log(
  `🕐 Ditutup: ${new Date(lastArchive.archived_at).toLocaleString("id-ID")}\n`
);

// Ambil data dengan urutan yang sama seperti API (display_order DESC)
const cashBooks = db
  .prepare(
    `
  SELECT * FROM cash_book 
  WHERE archived_label = ? AND archived_at = ?
  ORDER BY display_order DESC
`
  )
  .all(lastArchive.archived_label, lastArchive.archived_at);

console.log(`📝 Total transaksi: ${cashBooks.length}\n`);

if (cashBooks.length === 0) {
  console.log("❌ Tidak ada transaksi dalam arsip");
  db.close();
  process.exit(0);
}

// Transaksi pertama (index 0) seharusnya transaksi terakhir dengan nilai kumulatif
const latest = cashBooks[0];

console.log("=== TRANSAKSI TERAKHIR (Index 0) ===");
console.log(`Tanggal: ${latest.tanggal}`);
console.log(`Keperluan: ${latest.keperluan}`);
console.log(`Display Order: ${latest.display_order}\n`);

console.log("=== SUMMARY CARD VALUES ===");
console.log(`💰 Saldo: Rp ${latest.saldo.toLocaleString("id-ID")}`);
console.log(`📈 Omzet: Rp ${latest.omzet.toLocaleString("id-ID")}`);
console.log(
  `💸 Biaya Operasional: Rp ${latest.biaya_operasional.toLocaleString("id-ID")}`
);
console.log(
  `🛠️  Biaya Bahan: Rp ${latest.biaya_bahan.toLocaleString("id-ID")}`
);
console.log(
  `💵 Total Biaya: Rp ${(
    latest.biaya_operasional + latest.biaya_bahan
  ).toLocaleString("id-ID")}`
);
console.log(`💎 Laba Bersih: Rp ${latest.laba_bersih.toLocaleString("id-ID")}`);
console.log(`\n=== BAGI HASIL ===`);
console.log(`👤 Anwar: Rp ${latest.bagi_hasil_anwar.toLocaleString("id-ID")}`);
console.log(`👤 Suri: Rp ${latest.bagi_hasil_suri.toLocaleString("id-ID")}`);
console.log(`👤 Gemi: Rp ${latest.bagi_hasil_gemi.toLocaleString("id-ID")}`);
console.log(`\n=== KASBON ===`);
console.log(`👤 Anwar: Rp ${latest.kasbon_anwar.toLocaleString("id-ID")}`);
console.log(`👤 Suri: Rp ${latest.kasbon_suri.toLocaleString("id-ID")}`);
console.log(`👤 Cahaya: Rp ${latest.kasbon_cahaya.toLocaleString("id-ID")}`);
console.log(`👤 Dinil: Rp ${latest.kasbon_dinil.toLocaleString("id-ID")}`);

// Bandingkan dengan transaksi terakhir (index terakhir = transaksi paling awal)
const oldest = cashBooks[cashBooks.length - 1];
console.log("\n\n=== TRANSAKSI PERTAMA (Index Terakhir) ===");
console.log(`Tanggal: ${oldest.tanggal}`);
console.log(`Keperluan: ${oldest.keperluan}`);
console.log(`Display Order: ${oldest.display_order}`);
console.log(`💰 Saldo: Rp ${oldest.saldo.toLocaleString("id-ID")}`);
console.log(`📈 Omzet: Rp ${oldest.omzet.toLocaleString("id-ID")}`);

console.log("\n✅ Verifikasi: Index 0 harus digunakan untuk summary card!\n");

db.close();
