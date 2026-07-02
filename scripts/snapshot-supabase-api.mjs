/**
 * Ambil snapshot data cloud Supabase via REST API (HTTPS port 443).
 * Tidak membutuhkan pg_dump atau koneksi langsung ke port 5432.
 * Pemakaian: node scripts/snapshot-supabase-api.mjs [label]
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "./load-env-local.mjs";

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.local."
  );
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, "");
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "count=exact",
};

// Semua tabel public yang ingin di-snapshot
const TABLES = [
  "accounting_periods",
  "accounting_posting_rules",
  "audit_log",
  "barang",
  "barang_komponen",
  "barang_roll_variants",
  "biaya_tambahan_penjualan",
  "chart_of_accounts",
  "companies",
  "device_registry",
  "finance_category_definitions",
  "finance_metric_column_rules",
  "finance_metric_mappings",
  "fiscal_periods",
  "harga_barang_satuan",
  "hutang_pembelian",
  "inventory_movements",
  "item_finishing",
  "item_pembelian",
  "item_penawaran",
  "item_penjualan",
  "item_produksi",
  "item_retur_pembelian",
  "item_retur_penjualan",
  "item_surat_jalan",
  "journal_entries",
  "journal_entry_lines",
  "kategori_barang",
  "keuangan",
  "komponen_kompensasi",
  "kredensial",
  "laporan_bulanan",
  "lokasi",
  "nsfp_pool",
  "opsi_finishing",
  "order_produksi",
  "pegawai",
  "pelanggan",
  "pelunasan_hutang",
  "pelunasan_piutang",
  "pembelian",
  "penawaran",
  "pengaturan_toko",
  "penjualan",
  "peran_pegawai",
  "pinjaman_karyawan",
  "piutang_penjualan",
  "production_material_consumptions",
  "profil",
  "proses_gaji",
  "purchase_order_items",
  "purchase_orders",
  "retur_pembelian",
  "retur_penjualan",
  "rumus_buku_kas",
  "satuan_barang",
  "slip_gaji",
  "spesifikasi_cepat_barang",
  "stock_opname_items",
  "stock_opnames",
  "subkategori_barang",
  "surat_jalan",
  "sync_conflicts",
  "sync_mutation_registry",
  "transaksi_penggantian",
  "transaksi_terhitung",
  "vendor",
];

/** Ambil semua baris satu tabel dengan pagination (max 1000 per request). */
async function fetchAll(table) {
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const url = `${BASE}/rest/v1/${table}?select=*&order=id&limit=${PAGE}&offset=${from}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      const text = await res.text();
      // Tabel tidak ada atau tidak bisa diakses — lewati
      if (res.status === 404 || res.status === 400) {
        return { rows: [], skipped: true, reason: text.slice(0, 120) };
      }
      throw new Error(`GET ${table} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) break;
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return { rows, skipped: false };
}

/** Konversi nilai JS ke literal SQL. */
function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Hasilkan blok INSERT untuk satu tabel. */
function buildInserts(table, rows) {
  if (rows.length === 0) return `-- ${table}: 0 baris\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const lines = [`-- ${table}: ${rows.length} baris`];
  // Hapus dulu agar restore bisa dijalankan ulang
  lines.push(`DELETE FROM public."${table}";`);
  for (const row of rows) {
    const vals = cols.map((c) => sqlLiteral(row[c])).join(", ");
    lines.push(`INSERT INTO public."${table}" (${colList}) VALUES (${vals});`);
  }
  return lines.join("\n") + "\n";
}

// ─── Main ────────────────────────────────────────────────────────────────────
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotsDir = resolve(projectRoot, "snapshots");
mkdirSync(snapshotsDir, { recursive: true });

const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const ts =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const label = process.argv[2] ? `-${process.argv[2].replace(/[^a-zA-Z0-9_-]/g, "_")}` : "-api";
const filename = `snapshot-${ts}${label}.sql`;
const filepath = resolve(snapshotsDir, filename);

console.log(`Target : ${BASE}`);
console.log(`Output : ${filepath}`);
console.log(`Tabel  : ${TABLES.length}\n`);

const sqlParts = [
  `-- Snapshot via REST API`,
  `-- Dibuat   : ${now.toISOString()}`,
  `-- Sumber   : ${BASE}`,
  `-- CATATAN  : File ini berisi INSERT, bukan CREATE TABLE.`,
  `--            Jalankan ke local Supabase yang sudah punya skema.`,
  `SET session_replication_role = replica; -- nonaktifkan FK checks sementara\n`,
];

const summary = [];
let totalRows = 0;
let skippedCount = 0;

for (const table of TABLES) {
  process.stdout.write(`  Mengambil ${table.padEnd(45)} `);
  try {
    const { rows, skipped, reason } = await fetchAll(table);
    if (skipped) {
      console.log(`LEWATI (${reason})`);
      skippedCount++;
      summary.push({ table, rows: 0, status: "lewati" });
      continue;
    }
    console.log(`${rows.length.toLocaleString()} baris`);
    sqlParts.push(buildInserts(table, rows));
    totalRows += rows.length;
    summary.push({ table, rows: rows.length, status: "ok" });
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    summary.push({ table, rows: 0, status: "error" });
  }
}

sqlParts.push(`\nSET session_replication_role = DEFAULT;`);
sqlParts.push(`\n-- Ringkasan: ${totalRows.toLocaleString()} baris dari ${TABLES.length - skippedCount} tabel`);

writeFileSync(filepath, sqlParts.join("\n"), "utf8");

const sizeKB = (statSync(filepath).size / 1024).toFixed(1);

console.log(`\n${"─".repeat(60)}`);
console.log(`Snapshot selesai!`);
console.log(`  File   : ${filepath}`);
console.log(`  Ukuran : ${sizeKB} KB`);
console.log(`  Baris  : ${totalRows.toLocaleString()}`);
console.log(`  Lewati : ${skippedCount} tabel\n`);

console.log(`Ringkasan per tabel:`);
console.log(`${"Tabel".padEnd(45)} ${"Baris".padStart(8)}  Status`);
console.log("─".repeat(65));
for (const { table, rows, status } of summary) {
  console.log(`${table.padEnd(45)} ${String(rows).padStart(8)}  ${status}`);
}
console.log("─".repeat(65));
console.log(`${"TOTAL".padEnd(45)} ${String(totalRows).padStart(8)}\n`);

console.log(`Untuk restore ke local Supabase:`);
console.log(`  npm run supabase:local:start`);
console.log(`  psql postgresql://postgres:postgres@localhost:54322/postgres -f ${filepath}`);
