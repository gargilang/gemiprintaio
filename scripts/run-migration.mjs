/**
 * Applies one or more migration SQL files directly to the Supabase Postgres
 * database via DATABASE_URL (bypassing the Supabase CLI which requires a
 * Linux binary).
 *
 * Usage (from project root):
 *   node --env-file=.env.local scripts/run-migration.mjs <file1.sql> [file2.sql ...]
 *
 * If no files are given, it applies all pending migrations in
 * supabase/migrations/ that are not yet recorded in the migration tracking
 * table. "Pending" is determined simply by checking whether a table called
 * `_migration_log` has a row for that filename; it does NOT use Supabase's
 * internal schema_migrations table (which requires the CLI).
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
