/**
 * Restore schema `public` dari snapshot SQL yang tersimpan.
 * DESTRUKTIF — menghapus semua data dan menggantinya dengan isi snapshot.
 * Pemakaian:
 *   npm run db:restore                                  (menu interaktif)
 *   npm run db:restore -- snapshots/snapshot-x.sql --confirm  (non-interaktif)
 *   npm run db:snapshot:list                            (hanya lihat daftar)
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import readline from "node:readline";
import pg from "pg";

const conn = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!conn) {
  console.error(
    "Error: DATABASE_URL atau DIRECT_URL tidak ditemukan di .env.local.\n" +
      "Buka Supabase Dashboard → Settings → Database → Connection string, lalu tambahkan ke .env.local.",
  );
  process.exit(1);
}

// Cek psql tersedia
const psqlCheck = spawnSync("command", ["-v", "psql"], { shell: true });
if (psqlCheck.status !== 0) {
  console.error(
    "Error: psql tidak ditemukan. Install dengan:\n" +
      "  sudo pacman -S --noconfirm postgresql\n" +
      "Lalu jalankan ulang.",
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

const pgEnv = {
  ...process.env,
  PGUSER: parsed.username,
  PGPASSWORD: parsed.password,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || "5432",
  PGDATABASE: parsed.pathname.slice(1),
  PGSSLMODE: isLocal ? "disable" : "require",
};

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotsDir = resolve(projectRoot, "snapshots");
const wipeSQL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "wipe-public-schema.sql",
);

// Daftar snapshot, diurutkan by mtime descending (terbaru duluan)
function listSnapshots() {
  let files;
  try {
    files = readdirSync(snapshotsDir).filter((f) => f.endsWith(".sql"));
  } catch {
    return [];
  }
  return files
    .map((f) => {
      const fullPath = resolve(snapshotsDir, f);
      const st = statSync(fullPath);
      return { name: f, path: fullPath, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function countCopyBlocks(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    return (content.match(/^COPY /gm) || []).length;
  } catch {
    return "?";
  }
}

function formatDate(mtimeMs) {
  return new Date(mtimeMs).toLocaleString("id-ID");
}

const args = process.argv.slice(2);
const isListMode = args.includes("--list");
const isConfirm = args.includes("--confirm");
// Cari path snapshot dari argumen (argumen non-flag pertama)
const snapshotArg = args.find((a) => !a.startsWith("--"));

// Deteksi produksi (hanya peringatan, tidak diblokir — restore cloud adalah tujuannya)
const PROD_REFS = ["fugdoghnorlkfrpadfdl"];
const isProd = PROD_REFS.some((ref) => (parsed.hostname || "").includes(ref));

// Mode --list
if (isListMode) {
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log("Tidak ada snapshot tersimpan di folder snapshots/.");
    process.exit(0);
  }
  console.log(`Daftar snapshot (${snapshots.length} file):\n`);
  snapshots.forEach((s, i) => {
    const copyCount = countCopyBlocks(s.path);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${s.name}\n` +
        `      Ukuran: ${formatSize(s.size)}  |  Tanggal: ${formatDate(s.mtime)}  |  Blok data: ${copyCount}\n`,
    );
  });
  process.exit(0);
}

// Pilih snapshot
const snapshots = listSnapshots();
if (snapshots.length === 0) {
  console.log(
    "Tidak ada snapshot tersimpan di folder snapshots/.\n" +
      "Jalankan dulu: npm run db:snapshot",
  );
  process.exit(0);
}

let chosen;

if (snapshotArg) {
  // Mode non-interaktif: path diberikan via argumen
  const fullPath = resolve(projectRoot, snapshotArg);
  const found = snapshots.find(
    (s) => s.path === fullPath || s.name === basename(snapshotArg),
  );
  if (!found) {
    console.error(`Error: Snapshot tidak ditemukan: ${snapshotArg}`);
    process.exit(1);
  }
  if (!isConfirm) {
    console.error(
      "Error: Mode non-interaktif butuh flag --confirm.\n" +
        `Contoh: npm run db:restore -- ${snapshotArg} --confirm`,
    );
    process.exit(1);
  }
  chosen = found;
} else {
  // Mode interaktif: tampilkan menu
  console.log(`Daftar snapshot tersedia (${snapshots.length} file):\n`);
  snapshots.forEach((s, i) => {
    const copyCount = countCopyBlocks(s.path);
    console.log(
      `  ${String(i + 1).padStart(2)}. ${s.name}\n` +
        `      Ukuran: ${formatSize(s.size)}  |  Tanggal: ${formatDate(s.mtime)}  |  Blok data: ${copyCount}\n`,
    );
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  const indexStr = await ask(
    `Pilih nomor snapshot (1-${snapshots.length}), atau tekan Enter untuk batal: `,
  );
  if (!indexStr.trim()) {
    console.log("Dibatalkan.");
    rl.close();
    process.exit(0);
  }
  const index = parseInt(indexStr.trim(), 10) - 1;
  if (isNaN(index) || index < 0 || index >= snapshots.length) {
    console.error("Pilihan tidak valid.");
    rl.close();
    process.exit(1);
  }
  chosen = snapshots[index];

  // Peringatan keras
  console.log(
    "\n" +
      "════════════════════════════════════════════════════════════════\n" +
      "  ⚠  PERINGATAN KERAS\n" +
      "════════════════════════════════════════════════════════════════\n" +
      "  INI AKAN MENGHAPUS SEMUA DATA di cloud dan menggantinya\n" +
      "  dengan isi snapshot yang dipilih.\n\n" +
      `  Snapshot : ${chosen.name}\n` +
      `  Database : ${parsed.hostname}${parsed.pathname}\n` +
      (isProd ? "  STATUS   : *** DATABASE PRODUKSI ***\n" : "") +
      "════════════════════════════════════════════════════════════════\n",
  );

  // Konfirmasi ganda: ketik nama file persis
  const confirm1 = await ask(
    `Ketik nama file snapshot persis untuk konfirmasi\n(atau Enter untuk batal): `,
  );
  if (confirm1.trim() !== chosen.name) {
    console.log("Nama tidak cocok. Restore dibatalkan.");
    rl.close();
    process.exit(0);
  }

  const confirm2 = await ask(
    `Konfirmasi terakhir. Ketik "HAPUS" untuk melanjutkan (atau Enter untuk batal): `,
  );
  rl.close();
  if (confirm2.trim() !== "HAPUS") {
    console.log("Restore dibatalkan.");
    process.exit(0);
  }
}

// === Mulai restore ===
if (isProd) {
  console.log(
    "\nPeringatan: Anda merestore ke DATABASE PRODUKSI. Melanjutkan sesuai permintaan...\n",
  );
}

console.log(`\n[1/3] Menghapus schema public (wipe)...`);

const wipeSql = readFileSync(wipeSQL, "utf8");
const client = new pg.Client({
  connectionString: conn,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(wipeSql);
  console.log("      Schema public berhasil dihapus dan dibuat ulang.");
} finally {
  await client.end();
}

console.log(`[2/3] Memuat ulang snapshot: ${chosen.name} ...`);

const psqlResult = spawnSync("psql", ["-f", chosen.path], {
  env: pgEnv,
  stdio: ["ignore", "inherit", "pipe"],
});

if (psqlResult.status !== 0) {
  const errMsg = psqlResult.stderr
    ? psqlResult.stderr.toString()
    : "(tidak ada pesan error)";
  console.error("psql gagal:\n" + errMsg);
  process.exit(1);
}

console.log(`[3/3] Menjalankan ulang GRANT privileges (safety)...`);

const grantSQL = `
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;
`;

const grantClient = new pg.Client({
  connectionString: conn,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
await grantClient.connect();
try {
  await grantClient.query(grantSQL);
  console.log("      Privileges berhasil di-grant.");
} finally {
  await grantClient.end();
}

// Ringkasan
const copyCount = countCopyBlocks(chosen.path);
console.log(
  `\nRestore selesai!\n` +
    `  Snapshot : ${chosen.name}\n` +
    `  Blok data: ${copyCount} tabel berhasil direstore\n`,
);
