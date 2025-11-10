import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "..", "database", "gemiprint.db");

console.log("🧪 Testing Calculate Logic...\n");

const db = new Database(dbPath);

// Simulate the calculation logic
const rows = db
  .prepare(
    `
  SELECT * FROM keuangan 
  WHERE diarsipkan_pada IS NULL 
  ORDER BY urutan_tampilan ASC, dibuat_pada ASC
`
  )
  .all();

console.log(`📊 Total entries: ${rows.length}\n`);

let runningSaldo = 0;

rows.forEach((row, index) => {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Processing Entry #${index + 1}: ${row.kategori_transaksi}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const debit = row.debit || 0;
  const kredit = row.kredit || 0;

  console.log(`Debit: Rp ${debit.toLocaleString("id-ID")}`);
  console.log(`Kredit: Rp ${kredit.toLocaleString("id-ID")}`);
  console.log(
    `Override Flag: ${row.override_saldo} ${row.override_saldo ? "🔒" : "🔓"}`
  );
  console.log(`DB Saldo Value: Rp ${row.saldo.toLocaleString("id-ID")}`);

  const prevRunningSaldo = runningSaldo;

  if (!row.override_saldo) {
    runningSaldo += debit - kredit;
    console.log(`\n✅ CALCULATED:`);
    console.log(`   Previous: Rp ${prevRunningSaldo.toLocaleString("id-ID")}`);
    console.log(
      `   Change: ${debit - kredit > 0 ? "+" : ""}Rp ${(
        debit - kredit
      ).toLocaleString("id-ID")}`
    );
    console.log(
      `   New Running Total: Rp ${runningSaldo.toLocaleString("id-ID")}`
    );
  } else {
    runningSaldo = row.saldo;
    console.log(`\n🔒 OVERRIDE USED:`);
    console.log(
      `   Previous Running: Rp ${prevRunningSaldo.toLocaleString("id-ID")}`
    );
    console.log(`   Override Value: Rp ${row.saldo.toLocaleString("id-ID")}`);
    console.log(
      `   New Running Total: Rp ${runningSaldo.toLocaleString("id-ID")}`
    );
    console.log(
      `   ⚠️ NOTE: This breaks the chain! Next entries will use this as base.`
    );
  }

  console.log(
    `\n📌 Will Update DB: ${
      !row.override_saldo
        ? "YES (will write " + runningSaldo + ")"
        : "NO (locked)"
    }`
  );
});

console.log(`\n\n═══════════════════════════════════════════`);
console.log(`FINAL RESULT`);
console.log(`═══════════════════════════════════════════`);
console.log(`Final Running Saldo: Rp ${runningSaldo.toLocaleString("id-ID")}`);

console.log(`\n\n🔍 ANALYSIS:`);
const overrideEntries = rows.filter((r) => r.override_saldo === 1);
if (overrideEntries.length > 0) {
  console.log(`Found ${overrideEntries.length} override(s):`);
  overrideEntries.forEach((r, i) => {
    console.log(
      `  ${i + 1}. Entry ID ${r.id.substring(
        0,
        8
      )}: Saldo = Rp ${r.saldo.toLocaleString("id-ID")}`
    );
  });

  console.log(`\n⚠️ POTENTIAL ISSUE:`);
  console.log(
    `If the running saldo before an override changes (due to deletion/edit),`
  );
  console.log(
    `the override value stays the same, which might cause incorrect results.`
  );

  console.log(`\n💡 SOLUTION:`);
  console.log(`Override should be RELATIVE, not ABSOLUTE.`);
  console.log(
    `Store: override_saldo_delta = intended_saldo - calculated_saldo`
  );
  console.log(`Then: runningSaldo = calculated_saldo + override_saldo_delta`);
}

db.close();
