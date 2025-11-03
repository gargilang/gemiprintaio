// Migration: Make profiles.email optional (nullable) and keep UNIQUE constraint
// Jalankan dengan: node migrate-make-email-optional.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("DATABASE MIGRATION: MAKE profiles.email OPTIONAL (NULLABLE)");
console.log("=".repeat(70));
console.log("");

try {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  // Matikan foreign_keys sementara untuk migrasi skema tabel induk
  db.pragma("foreign_keys = OFF");

  // Inspect existing schema
  const tableInfo = db.prepare("PRAGMA table_info(profiles)").all();
  const emailCol = tableInfo.find((c) => c.name === "email");

  if (!emailCol) {
    console.log("❌ Tabel profiles tidak memiliki kolom email. Batalkan.");
    process.exit(1);
  }

  if (emailCol.notnull === 0) {
    console.log("✅ Kolom 'email' sudah nullable. Tidak perlu migrasi.");
    process.exit(0);
  }

  console.log("📝 Mengubah kolom 'email' menjadi nullable (opsional)...");

  // Wrap in transaction
  const tx = db.transaction(() => {
    // 1) Rename existing table
    db.exec("ALTER TABLE profiles RENAME TO profiles_old;");

    // 2) Create new table with desired schema (email nullable)
    db.exec(`
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        full_name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'manager', 'user')),
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 3) Copy data over; for empty string emails, insert NULL
    const rows = db.prepare("SELECT * FROM profiles_old").all();
    const insert = db.prepare(`
      INSERT INTO profiles (id, username, email, full_name, password_hash, role, is_active, created_at, updated_at)
      VALUES (@id, @username, @email, @full_name, @password_hash, @role, @is_active, @created_at, @updated_at)
    `);

    for (const r of rows) {
      const email =
        r.email === null || String(r.email).trim() === ""
          ? null
          : String(r.email).trim();
      insert.run({ ...r, email });
    }

    // 4) Drop old table
    db.exec("DROP TABLE profiles_old;");
  });

  tx();

  // Nyalakan kembali foreign_keys setelah migrasi
  db.pragma("foreign_keys = ON");

  console.log(
    "✅ Migrasi selesai. Kolom 'email' sekarang opsional (nullable)."
  );
  db.close();
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
