// Add password_hash column to existing profiles table
// Jalankan dengan: node migrate-add-password.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

console.log("=".repeat(70));
console.log("DATABASE MIGRATION: ADD PASSWORD_HASH COLUMN");
console.log("=".repeat(70));
console.log("");

try {
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Check if password_hash column exists
  const tableInfo = db.prepare("PRAGMA table_info(profiles)").all();
  const hasPasswordHash = tableInfo.some((col) => col.name === "password_hash");

  if (hasPasswordHash) {
    console.log("✅ Column 'password_hash' sudah ada");
  } else {
    console.log("📝 Menambahkan column 'password_hash'...");

    // Add column with default empty string
    db.exec(
      `ALTER TABLE profiles ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`
    );

    console.log("✅ Column 'password_hash' berhasil ditambahkan!");
  }

  // Check if admin user exists
  const adminUser = db
    .prepare("SELECT * FROM profiles WHERE username = 'gemi'")
    .get();

  if (!adminUser) {
    console.log("📝 Membuat user admin 'gemi'...");

    const stmt = db.prepare(`
      INSERT INTO profiles (id, username, email, full_name, password_hash, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      "admin-gemi-001",
      "gemi",
      "admin@gemiprint.com",
      "Gemi Administrator",
      "4c56ff4ce4aaf9573aa5dff913df997139722d34b8d3a0e844f5e3e8f0a1a7c0", // SHA-256 of "5555"
      "admin",
      1
    );

    console.log("✅ User admin 'gemi' berhasil dibuat!");
  } else if (!adminUser.password_hash || adminUser.password_hash === "") {
    console.log("📝 Update password untuk user 'gemi'...");

    const stmt = db.prepare(`
      UPDATE profiles 
      SET password_hash = ? 
      WHERE username = 'gemi'
    `);

    stmt.run(
      "4c56ff4ce4aaf9573aa5dff913df997139722d34b8d3a0e844f5e3e8f0a1a7c0"
    );

    console.log("✅ Password user 'gemi' berhasil diupdate!");
  } else {
    console.log("✅ User 'gemi' sudah ada dengan password");
  }

  // Verify admin user
  const verifyUser = db
    .prepare("SELECT * FROM profiles WHERE username = 'gemi'")
    .get();

  console.log("");
  console.log("-".repeat(70));
  console.log("VERIFIKASI USER ADMIN:");
  console.log("-".repeat(70));
  console.log("  Username:", verifyUser.username);
  console.log("  Email:", verifyUser.email);
  console.log("  Full Name:", verifyUser.full_name);
  console.log("  Role:", verifyUser.role);
  console.log("  Active:", verifyUser.is_active === 1 ? "Yes" : "No");
  console.log("  Has Password:", verifyUser.password_hash ? "Yes" : "No");

  db.close();

  console.log("");
  console.log("=".repeat(70));
  console.log("✅ MIGRATION SELESAI");
  console.log("=".repeat(70));
  console.log("");
  console.log("Sekarang Anda bisa login dengan:");
  console.log("  Username: gemi");
  console.log("  Password: 5555");
  console.log("");
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
