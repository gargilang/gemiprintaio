/**
 * Bangun ulang database/gemiprint.db dari database/sqlite-schema.sql + sqlite-default-values.sql
 * (dipakai sebagai template include_bytes! Tauri dan untuk paritas lokal dengan data seed Supabase).
 * Jalankan: npm run db:build-template
 */
import { readFileSync, existsSync, copyFileSync, renameSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "database", "gemiprint.db");
const schema = readFileSync(join(root, "database", "sqlite-schema.sql"), "utf8");
const seed = readFileSync(join(root, "database", "sqlite-default-values.sql"), "utf8");
const backupPath = outPath + ".pre-rebuild-bak";

if (existsSync(outPath)) {
  copyFileSync(outPath, backupPath);
  console.log("Backup:", backupPath);
}

if (existsSync(outPath)) {
  try {
    unlinkSync(outPath);
  } catch {
    // Windows may still lock; write to temp then replace
  }
}
const tempPath = outPath + ".tmp";
if (existsSync(tempPath)) unlinkSync(tempPath);

const db = new Database(tempPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = DELETE");
db.exec(schema);
db.exec(seed);
db.close();
renameSync(tempPath, outPath);
console.log("Wrote", outPath);
