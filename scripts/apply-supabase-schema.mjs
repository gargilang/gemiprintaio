/**
 * Terapkan supabase/schema.sql dan supabase/seed-default-values.sql
 * secara berurutan, memakai connection string Postgres (sama dengan supabase:wipe).
 *
 * Butuh: DATABASE_URL atau DIRECT_URL di .env.local
 * Jalankan: npm run supabase:apply
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
  console.error(
    "Missing DATABASE_URL or DIRECT_URL. Add the Postgres URI from Supabase → Settings → Database, then run again."
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const schemaPath = join(root, "supabase", "schema.sql");
const seedPath = join(root, "supabase", "seed-default-values.sql");

if (!existsSync(schemaPath) || !existsSync(seedPath)) {
  console.error("Missing", schemaPath, "or", seedPath);
  process.exit(1);
}

const schema = readFileSync(schemaPath, "utf8");
const seed = readFileSync(seedPath, "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(schema);
  await client.query(seed);
  console.log("Done: Supabase schema + default seed applied.");
} catch (e) {
  console.error(e.message);
  if (e.message?.includes("already exists")) {
    console.error(
      "\nHint: on a database that already has this schema, run a wipe first: npm run supabase:wipe"
    );
  }
  process.exit(1);
} finally {
  await client.end();
}
