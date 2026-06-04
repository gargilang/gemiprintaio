#!/usr/bin/env node
/**
 * Seed satu pengguna admin lokal ke ./database/gemiprint.db (hanya SQLite).
 *
 * Idempoten: kalau pengguna dengan `nama_pengguna` yang sama sudah ada,
 * password di-reset (dan role/aktif_status dipaksa ke admin/active) supaya
 * developer selalu punya kredensial yang diketahui untuk QA halaman baru.
 *
 * Usage:
 *   node scripts/seed-local-admin.mjs               # admin / admin123
 *   node scripts/seed-local-admin.mjs --user=foo --password=bar
 *
 * After running, start `next dev` with:
 *   GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR=1 npm run dev
 *
 * NOTE: This script never touches Supabase. It only writes to the local
 * SQLite file at ./database/gemiprint.db.
 */

import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function parseArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

const username = parseArg("user", "admin");
const password = parseArg("password", "admin123");
const fullName = parseArg("name", "Local Admin");
const email = parseArg("email", "admin@local");

const dbDir = path.join(projectRoot, "database");
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, "gemiprint.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Ensure the profil table exists (in case dev is starting from scratch).
const tableInfo = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profil'")
  .get();
if (!tableInfo) {
  console.error(
    "❌ profil table is missing in database/gemiprint.db. Run the SQLite bootstrap first (see src/lib/db-unified.ts ensureServerSQLiteSyncV2Schema)."
  );
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
const now = new Date().toISOString();

const existing = db
  .prepare("SELECT id FROM profil WHERE nama_pengguna = ? LIMIT 1")
  .get(username);

if (existing?.id) {
  db.prepare(
    `UPDATE profil
       SET password_hash = ?,
           role = 'admin',
           aktif_status = 1,
           nama_lengkap = COALESCE(NULLIF(?, ''), nama_lengkap),
           email = COALESCE(NULLIF(?, ''), email),
           diperbarui_pada = ?
     WHERE id = ?`
  ).run(hash, fullName, email, now, existing.id);
  console.log(`✅ Updated existing local admin ${username} (id=${existing.id}).`);
} else {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO profil (
       id, nama_pengguna, email, nama_lengkap, password_hash, role,
       aktif_status, dibuat_pada, diperbarui_pada
     ) VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?)`
  ).run(id, username, email, fullName, hash, now, now);
  console.log(`✅ Created local admin ${username} (id=${id}).`);
}

console.log(`   user: ${username}`);
console.log(`   pass: ${password}`);
console.log(`   db:   ${dbPath}`);
console.log("");
console.log("Start the web dev server with the SQLite mirror enabled:");
console.log("   GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR=1 npm run dev");
db.close();
