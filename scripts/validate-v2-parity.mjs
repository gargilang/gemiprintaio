/**
 * validate-v2-parity.mjs
 *
 * Bandingkan kolom hardcoded legacy di `keuangan` terhadap baris
 * `transaction_computed` baru untuk formula yang sama. Cetak diff per-baris
 * dan tally akhir supaya operator bisa memutuskan apakah aman untuk
 * menjatuhkan kolom legacy (Fase 8 dari refactor Expression Assistant).
 *
 * Pemakaian:
 *   node scripts/validate-v2-parity.mjs                 # SQLite lokal
 *   node --env-file=.env.local scripts/validate-v2-parity.mjs --tolerance 0.5
 *
 * Flag:
 *   --tolerance N   Selisih absolut yang diizinkan (default 0)
 *   --formula KEY   Only compare a single formula_key (default: all known)
 *   --limit N       Stop printing diffs after N rows (default 25)
 *
 * Exit status:
 *   0 — every value matches within tolerance
 *   1 — at least one mismatch (safe to inspect, NOT safe to drop columns)
 *   2 — environment problem (no DB / missing tables / missing columns)
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, fallback = null) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const TOLERANCE = Number(flag("--tolerance", "0")) || 0;
const ONLY = typeof flag("--formula") === "string" ? flag("--formula") : null;
const LIMIT = Number(flag("--limit", "25")) || 25;

// ── DB ───────────────────────────────────────────────────────────────────────

const sqlitePath = join(root, "database", "gemiprint.db");
if (!existsSync(sqlitePath)) {
  console.error(`✘ SQLite database not found at ${sqlitePath}.`);
  console.error("  Run the app once or pass --supabase (not implemented yet).");
  process.exit(2);
}

let DB;
try {
  const mod = await import("better-sqlite3");
  const Database = mod.default ?? mod;
  DB = new Database(sqlitePath, { readonly: true });
} catch (e) {
  console.error("✘ Failed to open SQLite:", e.message);
  process.exit(2);
}

// ── Discover legacy columns ─────────────────────────────────────────────────

/** Static map: legacy column → semantic formula_key */
const LEGACY_COLUMNS = [
  ["omzet", "omzet"],
  ["biaya_operasional", "biaya_operasional"],
  ["biaya_bahan", "biaya_bahan"],
  ["saldo", "saldo"],
  ["laba_bersih", "laba_bersih"],
];

const cashbookCols = (DB.prepare("PRAGMA table_info(keuangan)").all() ?? []).map(
  (c) => c.name
);

// Per-actor formulas (kasbon_*, bagi_hasil_*) — derive from cashbook_formula
// instead of hardcoding so we cover whatever the install actually has.
let dynamicCols = [];
try {
  const rows = DB.prepare(
    `SELECT DISTINCT formula_key, db_column
       FROM cashbook_formula
      WHERE enabled = 1
        AND formula_key IS NOT NULL
        AND formula_group IN ('profit_share', 'cash_advance', 'bonus')`
  ).all();
  dynamicCols = rows
    .map((r) => [r.db_column, r.formula_key ?? r.db_column])
    .filter(([col]) => cashbookCols.includes(col));
} catch (e) {
  console.error("✘ cashbook_formula not present:", e.message);
  process.exit(2);
}

const allCols = [...LEGACY_COLUMNS, ...dynamicCols].filter(([col]) =>
  cashbookCols.includes(col)
);

const targets = ONLY
  ? allCols.filter(([, key]) => key === ONLY)
  : allCols;
if (targets.length === 0) {
  console.error("✘ No matching legacy columns found in keuangan.");
  process.exit(2);
}

console.log(
  `Comparing ${targets.length} formula(s) — tolerance ±${TOLERANCE}, max ${LIMIT} mismatches per formula.`
);

// ── Compare ─────────────────────────────────────────────────────────────────

let totalRows = 0;
let totalMismatches = 0;
const summary = [];

for (const [col, key] of targets) {
  const rows = DB.prepare(
    `SELECT k.id              AS id,
            k.tanggal         AS tanggal,
            COALESCE(k.${col}, 0)    AS legacy,
            COALESCE(tc.value, 0)    AS v2
       FROM keuangan k
       LEFT JOIN transaction_computed tc
         ON tc.transaction_id = k.id AND tc.formula_key = ?
      ORDER BY k.urutan_tampilan ASC`
  ).all(key);

  let mismatches = 0;
  let printed = 0;
  for (const r of rows) {
    totalRows += 1;
    const diff = Math.abs(Number(r.legacy) - Number(r.v2));
    if (diff > TOLERANCE) {
      mismatches += 1;
      totalMismatches += 1;
      if (printed < LIMIT) {
        console.log(
          `  ✘ ${key} · ${r.tanggal} · ${r.id}  legacy=${r.legacy}  v2=${r.v2}  Δ=${diff}`
        );
        printed += 1;
      }
    }
  }

  summary.push({ key, rows: rows.length, mismatches });
  if (mismatches === 0) {
    console.log(`  ✓ ${key}  (${rows.length} rows match)`);
  } else if (mismatches > printed) {
    console.log(
      `    … ${mismatches - printed} more mismatch(es) hidden (raise --limit to see)`
    );
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log("");
console.log("───── Summary ─────");
for (const s of summary) {
  const status = s.mismatches === 0 ? "OK" : `${s.mismatches} mismatches`;
  console.log(`  ${s.key.padEnd(28)}  ${status}`);
}
console.log("");
if (totalMismatches === 0) {
  console.log(
    `✓ ${totalRows} rows compared, all match within ±${TOLERANCE}. Safe to drop legacy columns.`
  );
  process.exit(0);
}
console.log(
  `✘ ${totalMismatches} mismatch(es) across ${totalRows} rows. Investigate before dropping legacy columns.`
);
process.exit(1);
