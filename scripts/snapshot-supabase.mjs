/**
 * Simpan snapshot schema `public` ke file SQL plain-text.
 * Aman — hanya membaca, tidak mengubah data.
 * Pemakaian: npm run db:snapshot [label]
 */
import { mkdirSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error(
    "Error: DATABASE_URL atau DIRECT_URL tidak ditemukan di .env.local.\n" +
      "Buka Supabase Dashboard → Settings → Database → Connection string, lalu tambahkan ke .env.local."
  );
  process.exit(1);
}

// Cek pg_dump tersedia
const pgDumpCheck = spawnSync("command", ["-v", "pg_dump"], { shell: true });
if (pgDumpCheck.status !== 0) {
  console.error(
    "Error: pg_dump tidak ditemukan. Install dengan:\n" +
      "  sudo pacman -S --noconfirm postgresql\n" +
      "Lalu jalankan ulang."
  );
  process.exit(1);
}

// Parse connection string
let parsed;
try {
  parsed = new URL(conn);
} catch {
  console.error("Error: Connection string tidak valid (bukan URL Postgres).");
  process.exit(1);
}

// Deteksi koneksi lokal (localhost/127.0.0.1) — tidak butuh SSL
const isLocal =
  parsed.hostname === "localhost" ||
  parsed.hostname === "127.0.0.1" ||
  parsed.hostname === "::1";

// Siapkan env untuk child process (password tidak masuk argv)
const pgEnv = {
  ...process.env,
  PGUSER: parsed.username,
  PGPASSWORD: parsed.password,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGDATABASE: parsed.pathname.slice(1),
  PGSSLMODE: isLocal ? "disable" : "require",
};

// Siapkan folder snapshots/
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotsDir = resolve(projectRoot, "snapshots");
mkdirSync(snapshotsDir, { recursive: true });

// Nama file: snapshot-YYYY-MM-DDTHH-MM-SS[-label].sql
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const timestamp =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const label = process.argv[2] ? `-${process.argv[2].replace(/[^a-zA-Z0-9_-]/g, "_")}` : "";
const filename = `snapshot-${timestamp}${label}.sql`;
const filepath = resolve(snapshotsDir, filename);

console.log(`Membuat snapshot schema public → ${filepath} ...`);

// Jalankan pg_dump
const result = spawnSync(
  "pg_dump",
  ["--schema=public", "--no-owner", "--no-privileges", "-f", filepath],
  { env: pgEnv, stdio: ["ignore", "inherit", "pipe"] }
);

if (result.status !== 0) {
  const errMsg = result.stderr ? result.stderr.toString() : "(tidak ada pesan error)";
  console.error("pg_dump gagal:\n" + errMsg);
  process.exit(1);
}

// Statistik
const stat = statSync(filepath);
const sizeKB = (stat.size / 1024).toFixed(1);
const content = readFileSync(filepath, "utf8");
const tableCount = (content.match(/^CREATE TABLE /gm) || []).length;
const copyCount = (content.match(/^COPY /gm) || []).length;

console.log(
  `\nSnapshot berhasil disimpan!\n` +
    `  File  : ${filepath}\n` +
    `  Ukuran: ${sizeKB} KB\n` +
    `  Tabel : ${tableCount} CREATE TABLE ditemukan\n` +
    `  Data  : ${copyCount} blok COPY ditemukan\n\n` +
    `Pengingat: Salin folder \`snapshots/\` ke Google Drive/Dropbox agar aman bila laptop rusak.`
);
