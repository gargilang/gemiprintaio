/**
 * Drop dan buat ulang skema `public` (SQL yang sama dengan wipe-public-schema.sql).
 * Butuh DATABASE_URL atau DIRECT_URL di .env.local (Supabase → Settings → Database).
 * Pemakaian: npm run supabase:wipe
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { confirmOrExit } from "./_lib/guard.mjs";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or DIRECT_URL. Add the Postgres URI from Supabase Dashboard → Settings → Database, then run again."
  );
  process.exit(1);
}

await confirmOrExit({
  target: connectionString,
  action: "DROP SCHEMA public CASCADE (WIPE)",
  allowProd: true,
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "wipe-public-schema.sql"), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log(
    "Done: public schema wiped. Next: npm run supabase:apply (or paste supabase/schema.sql + seed in SQL Editor)."
  );
} finally {
  await client.end();
}
