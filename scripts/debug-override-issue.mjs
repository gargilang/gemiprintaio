import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "..", "database", "gemiprint.db");

console.log("🔍 Debugging Override Issue...\n");

const db = new Database(dbPath);

// Get all entries
const entries = db
  .prepare(
    `
  SELECT 
    id, tanggal, kategori_transaksi, debit, kredit, keperluan,
    saldo, override_saldo,
    omzet, override_omzet,
    biaya_operasional, override_biaya_operasional,
    biaya_bahan, override_biaya_bahan,
    laba_bersih, override_laba_bersih,
    kasbon_anwar, override_kasbon_anwar,
    kasbon_suri, override_kasbon_suri,
    bagi_hasil_anwar, override_bagi_hasil_anwar,
    bagi_hasil_suri, override_bagi_hasil_suri,
    bagi_hasil_gemi, override_bagi_hasil_gemi,
    urutan_tampilan
  FROM keuangan 
  WHERE diarsipkan_pada IS NULL 
  ORDER BY urutan_tampilan ASC, dibuat_pada ASC
`
  )
  .all();

console.log(`📊 Total entries: ${entries.length}\n`);

entries.forEach((entry, index) => {
  console.log(`═══════════════════════════════════════════`);
  console.log(`Entry #${index + 1} - ${entry.kategori_transaksi}`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`Keperluan: ${entry.keperluan}`);
  console.log(`Debit: Rp ${entry.debit.toLocaleString("id-ID")}`);
  console.log(`Kredit: Rp ${entry.kredit.toLocaleString("id-ID")}`);

  console.log(`\n💰 SALDO:`);
  console.log(`   Value: Rp ${entry.saldo.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_saldo} ${
      entry.override_saldo ? "🔒 LOCKED" : "🔓 AUTO"
    }`
  );

  console.log(`\n📊 OMZET:`);
  console.log(`   Value: Rp ${entry.omzet.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_omzet} ${
      entry.override_omzet ? "🔒" : "🔓"
    }`
  );

  console.log(`\n💸 KASBON ANWAR:`);
  console.log(`   Value: Rp ${entry.kasbon_anwar.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_kasbon_anwar} ${
      entry.override_kasbon_anwar ? "🔒" : "🔓"
    }`
  );

  console.log(`\n💸 KASBON SURI:`);
  console.log(`   Value: Rp ${entry.kasbon_suri.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_kasbon_suri} ${
      entry.override_kasbon_suri ? "🔒" : "🔓"
    }`
  );

  console.log(`\n📈 BAGI HASIL ANWAR:`);
  console.log(`   Value: Rp ${entry.bagi_hasil_anwar.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_bagi_hasil_anwar} ${
      entry.override_bagi_hasil_anwar ? "🔒" : "🔓"
    }`
  );

  console.log(`\n📈 BAGI HASIL SURI:`);
  console.log(`   Value: Rp ${entry.bagi_hasil_suri.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_bagi_hasil_suri} ${
      entry.override_bagi_hasil_suri ? "🔒" : "🔓"
    }`
  );

  console.log(`\n📈 BAGI HASIL GEMI:`);
  console.log(`   Value: Rp ${entry.bagi_hasil_gemi.toLocaleString("id-ID")}`);
  console.log(
    `   Override Flag: ${entry.override_bagi_hasil_gemi} ${
      entry.override_bagi_hasil_gemi ? "🔒" : "🔓"
    }`
  );

  console.log(``);
});

console.log(`\n═══════════════════════════════════════════`);
console.log(`SUMMARY`);
console.log(`═══════════════════════════════════════════`);

const lastEntry = entries[entries.length - 1];
if (lastEntry) {
  console.log(`Final Saldo: Rp ${lastEntry.saldo.toLocaleString("id-ID")}`);
  console.log(`Final Omzet: Rp ${lastEntry.omzet.toLocaleString("id-ID")}`);
  console.log(
    `Final Laba Bersih: Rp ${lastEntry.laba_bersih.toLocaleString("id-ID")}`
  );
}

// Check if override flags are working
const overrideCount = entries.filter(
  (e) =>
    e.override_saldo ||
    e.override_omzet ||
    e.override_biaya_operasional ||
    e.override_biaya_bahan ||
    e.override_laba_bersih ||
    e.override_kasbon_anwar ||
    e.override_kasbon_suri ||
    e.override_bagi_hasil_anwar ||
    e.override_bagi_hasil_suri ||
    e.override_bagi_hasil_gemi
).length;

console.log(`\n🔒 Entries with overrides: ${overrideCount}`);

if (overrideCount === 0) {
  console.log(`\n⚠️ WARNING: No override flags found!`);
  console.log(`This means manual overrides are not being saved to database.`);
}

db.close();
