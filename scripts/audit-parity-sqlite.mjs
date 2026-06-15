// Audit parity skema: bandingkan kolom tiap tabel sync antara baseline Postgres
// (sumber kebenaran) dan SQLite (template + runtime migrations).
//
// Jalankan sebelum rilis desktop (Tauri) untuk mencegah silent data-loss saat
// pull: bila Postgres punya kolom yang tidak ada di SQLite, baris itu di-skip
// diam-diam oleh sync engine. Lihat docs/migrasi-singapura-dan-perbaikan.md.
//
// Jalankan: node scripts/audit-parity-sqlite.mjs
//
// Exit code:
//   0 = aman. Sisa drift (kalau ada) semuanya dikompensasi runtime migrations.
//   1 = BERBAHAYA. Ada kolom/tabel yang hilang di template DAN tidak ditambah
//       runtime — risiko silent-drop nyata saat pull. Wajib diperbaiki.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pgSql = readFileSync(
  join(root, "supabase/migrations/20260615000000_baseline_checkpoint.sql"),
  "utf8",
);
const liteSql = readFileSync(join(root, "database/sqlite-schema.sql"), "utf8");
const runtimeTs = readFileSync(
  join(root, "src/lib/db-sqlite-migrations.ts"),
  "utf8",
);

// Daftar tabel pull diparse langsung dari src/lib/db-sqlite.ts (SYNC_V2_TABLES)
// agar tidak rot saat daftar sumber berubah.
const dbSqliteTs = readFileSync(join(root, "src/lib/db-sqlite.ts"), "utf8");
const syncBlockMatch = dbSqliteTs.match(
  /export const SYNC_V2_TABLES\s*=\s*\[([\s\S]*?)\]/
);
if (!syncBlockMatch) {
  throw new Error("Tidak bisa menemukan SYNC_V2_TABLES di src/lib/db-sqlite.ts");
}
const SYNC_TABLES = [...syncBlockMatch[1].matchAll(/["']([a-z_][a-z0-9_]*)["']/gi)].map(
  (m) => m[1]
);
if (SYNC_TABLES.length === 0) {
  throw new Error("SYNC_V2_TABLES terparse kosong — cek format db-sqlite.ts");
}

// Ekstrak isi dalam tanda kurung dari CREATE TABLE, dengan menyeimbangkan paren.
function extractBody(sql, startIdx) {
  let i = sql.indexOf("(", startIdx);
  if (i < 0) return null;
  let depth = 0;
  const start = i;
  for (; i < sql.length; i++) {
    const c = sql[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return sql.slice(start + 1, i);
    }
  }
  return null;
}

// Postgres: CREATE TABLE IF NOT EXISTS "public"."tabel" ( ... )
function pgColumns(table) {
  const re = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+"public"\\."${table}"\\s*\\(`,
    "i",
  );
  const m = re.exec(pgSql);
  if (!m) return null;
  const body = extractBody(pgSql, m.index);
  if (body == null) return null;
  return parseCols(body);
}

// SQLite: CREATE TABLE tabel ( ... )  atau  CREATE TABLE "tabel" ( ... )
function liteColumns(table) {
  const re = new RegExp(`CREATE TABLE\\s+"?${table}"?\\s*\\(`, "i");
  const m = re.exec(liteSql);
  if (!m) return null;
  const body = extractBody(liteSql, m.index);
  if (body == null) return null;
  return parseCols(body);
}

// Pisah body jadi item top-level (koma di luar paren), lalu ambil nama kolom.
function parseCols(body) {
  const items = [];
  let depth = 0,
    cur = "";
  for (const c of body) {
    if (c === "(") {
      depth++;
      cur += c;
    } else if (c === ")") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      items.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) items.push(cur);

  const cols = new Set();
  // Kata kunci yang menandai constraint tabel (bukan kolom)
  const constraintKw = /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|KEY)\b/i;
  for (let item of items) {
    item = item.trim();
    if (!item) continue;
    if (constraintKw.test(item)) continue;
    // Nama kolom: token pertama, bisa "quoted" (pg) atau telanjang (lite)
    let name;
    if (item[0] === '"') {
      name = item.slice(1, item.indexOf('"', 1));
    } else {
      name = item.split(/[\s(]/)[0];
    }
    if (name) cols.add(name);
  }
  return cols;
}

// 6 kolom sync V2 ditambahkan ke SEMUA tabel di SYNC_V2_TABLES oleh loop generik
// di db-sqlite-migrations.ts (ensureServerSQLiteSyncV2Schema).
const V2_SYNC_COLUMNS = new Set([
  "updated_at_server",
  "updated_by_device",
  "change_version",
  "is_deleted",
  "deleted_at",
  "client_mutation_id",
]);

// Ambil isi blok CREATE TABLE <table> ( ... ) dari teks runtime (bila ada).
function runtimeCreateBlock(table) {
  const re = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${table}"?\\s*\\(`,
    "i"
  );
  const m = re.exec(runtimeTs);
  if (!m) return null;
  return extractBody(runtimeTs, m.index);
}

// Apakah runtime menambah `col` ke `table` secara spesifik (bukan grep global)?
function runtimeHasColumn(table, col) {
  // (1) Kolom V2 generik untuk tabel yang ikut SYNC_V2_TABLES.
  if (V2_SYNC_COLUMNS.has(col) && SYNC_TABLES.includes(table)) return true;
  // (2) ALTER TABLE <table> ADD COLUMN <col> — di-scope ke nama tabel.
  const alterRe = new RegExp(
    `ALTER TABLE\\s+"?${table}"?\\s+ADD COLUMN[^\\n;]*\\b${col}\\b`,
    "i"
  );
  if (alterRe.test(runtimeTs)) return true;
  // (3) Kolom ada di blok CREATE TABLE <table> runtime.
  const block = runtimeCreateBlock(table);
  if (block && parseCols(block).has(col)) return true;
  return false;
}
function runtimeCreatesTable(table) {
  const re = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${table}"?\\b`,
    "i",
  );
  return re.test(runtimeTs);
}

console.log("=== AUDIT PARITY: Postgres (sumber kebenaran) vs SQLite ===\n");
const missingTables = [];
const drift = [];
// Drift berbahaya: kolom/tabel yang hilang di template DAN tidak dikompensasi
// runtime — inilah yang menyebabkan silent-drop saat pull.
const dangerous = [];

for (const t of SYNC_TABLES) {
  const pg = pgColumns(t);
  const lite = liteColumns(t);
  if (!pg) {
    console.log(`[?] ${t}: TIDAK ditemukan di baseline Postgres`);
    continue;
  }
  if (!lite) {
    const created = runtimeCreatesTable(t);
    missingTables.push(t);
    if (!created) {
      dangerous.push(`tabel ${t}`);
      console.log(`[TABEL HILANG di sqlite-schema] ${t} (runtime creates? false)`);
      continue;
    }
    // Tabel dibuat runtime — periksa kolomnya juga (jangan buta).
    const block = runtimeCreateBlock(t);
    const runtimeCols = block ? parseCols(block) : new Set();
    if (SYNC_TABLES.includes(t)) {
      for (const c of V2_SYNC_COLUMNS) runtimeCols.add(c);
    }
    const missingInRuntime = [...pg].filter((c) => !runtimeCols.has(c));
    if (missingInRuntime.length) {
      for (const c of missingInRuntime) dangerous.push(`${t}.${c}`);
      console.log(
        `[TABEL HILANG di sqlite-schema] ${t} (runtime creates? true) — kolom tak terbangun: ${missingInRuntime.join(", ")}`
      );
    } else {
      console.log(`[TABEL HILANG di sqlite-schema] ${t} (runtime creates? true, kolom lengkap)`);
    }
    continue;
  }
  const missingCols = [...pg].filter((c) => !lite.has(c));
  if (missingCols.length) {
    const detail = missingCols.map((c) => {
      const ok = runtimeHasColumn(t, c);
      if (!ok) dangerous.push(`${t}.${c}`);
      return `${c}${ok ? " (ada di runtime)" : " (TIDAK ada di runtime)"}`;
    });
    drift.push({ table: t, cols: missingCols });
    console.log(`[KOLOM HILANG] ${t}: ${detail.join(", ")}`);
  }
}

console.log("\n=== RINGKASAN ===");
console.log(
  `Tabel hilang di sqlite-schema: ${missingTables.length ? missingTables.join(", ") : "(tidak ada)"}`,
);
console.log(
  `Tabel dengan kolom drift (template): ${drift.length ? drift.map((d) => d.table).join(", ") : "(tidak ada)"}`,
);

if (dangerous.length) {
  console.log(
    `\n\u274c BERBAHAYA — tidak dikompensasi runtime (risiko silent-drop saat pull):\n   ${dangerous.join("\n   ")}`,
  );
  process.exit(1);
} else {
  console.log(
    "\n\u2705 AMAN — semua sisa drift template dikompensasi runtime migrations.",
  );
}
