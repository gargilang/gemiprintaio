/**
 * Terapkan satu atau beberapa file SQL migrasi langsung ke database Supabase
 * Postgres via DATABASE_URL (melewati Supabase CLI yang butuh binary Linux).
 *
 * Pemakaian (dari root project):
 *   node --env-file=.env.local scripts/run-migration.mjs <file1.sql> [file2.sql ...]
 *
 * Kalau tidak ada file yang diberikan, terapkan semua migrasi pending di
 * supabase/migrations/ yang belum tercatat di tabel pelacak migrasi. "Pending"
 * ditentukan dengan cek apakah tabel bernama `_migration_log` punya baris
 * untuk nama file itu; TIDAK memakai tabel schema_migrations internal Supabase
 * (yang butuh CLI).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error(
    "❌  Missing DATABASE_URL or DIRECT_URL in environment.  Add it to .env.local."
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  // Ensure our lightweight tracking table exists.
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migration_log (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Determine which files to run.
  let files = process.argv.slice(2);
  if (files.length === 0) {
    // Auto-discover all *.sql files in migrations/ sorted by name.
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => join(migrationsDir, f));
  }

  let applied = 0;
  let skipped = 0;

  for (const filePath of files) {
    const name = basename(filePath);
    const { rows } = await client.query(
      "SELECT 1 FROM _migration_log WHERE name = $1",
      [name]
    );
    if (rows.length > 0) {
      console.log(`⏭  ${name} — déjà appliqué, skip`);
      skipped++;
      continue;
    }

    const sql = readFileSync(filePath, "utf8");
    console.log(`▶  Applying ${name} …`);
    await client.query(sql);
    await client.query(
      "INSERT INTO _migration_log (name) VALUES ($1) ON CONFLICT DO NOTHING",
      [name]
    );
    console.log(`✅  ${name} — done`);
    applied++;
  }

  console.log(`\nFini. Applied: ${applied}, Skipped (already done): ${skipped}`);
} catch (e) {
  console.error("❌  Migration error:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
