/**
 * Terapkan satu file migrasi Supabase tanpa menghapus database.
 *
 * Pemakaian:
 *   node --env-file=.env.local scripts/apply-migration.mjs
 *   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/20260521090000_business_actors_v2.sql
 *
 * Butuh DATABASE_URL atau DIRECT_URL di .env.local (Postgres URI dari
 * Supabase → Settings → Database).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { confirmOrExit } from "./_lib/guard.mjs";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or DIRECT_URL in .env.local (Supabase → Settings → Database)."
  );
  process.exit(1);
}

await confirmOrExit({
  target: connectionString,
  action: "APPLY satu file migrasi",
  allowProd: true,
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const defaultMigration = join(
  root,
  "supabase",
  "migrations",
  "20260521090000_business_actors_v2.sql"
);
const migrationPath = process.argv[2]
  ? join(root, process.argv[2].replace(/^\//, ""))
  : defaultMigration;

if (!existsSync(migrationPath)) {
  console.error("Migration file not found:", migrationPath);
  process.exit(1);
}

const sql = readFileSync(migrationPath, "utf8");
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

console.log("Applying:", migrationPath);
await client.connect();
try {
  await client.query(sql);
  console.log("Done. Tables actor_roles, business_actors, transaction_computed, transaction_overrides should now exist.");
  console.log(
    "If PostgREST still errors, open Supabase Dashboard → Settings → API → Reload schema cache (or wait ~1 min)."
  );
} catch (e) {
  console.error("Migration failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
