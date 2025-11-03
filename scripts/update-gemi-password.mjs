// Update password hash for gemi user
// Jalankan dengan: node update-gemi-password.mjs

import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_FILE = join(__dirname, "gemiprintaio.db");

async function generatePasswordHash(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

console.log("=".repeat(70));
console.log("UPDATE PASSWORD FOR USER 'GEMI'");
console.log("=".repeat(70));
console.log("");

try {
  const db = new Database(DB_FILE);

  // Generate correct hash for "5555"
  const password = "5555";
  const hash = await generatePasswordHash(password);

  console.log("Password:", password);
  console.log("New Hash:", hash);
  console.log("");

  // Update user password
  const stmt = db.prepare(`
    UPDATE profiles 
    SET password_hash = ? 
    WHERE username = 'gemi'
  `);

  const result = stmt.run(hash);

  if (result.changes > 0) {
    console.log("✅ Password berhasil diupdate!");
  } else {
    console.log("❌ User 'gemi' tidak ditemukan!");
  }

  // Verify
  const user = db
    .prepare("SELECT * FROM profiles WHERE username = 'gemi'")
    .get();

  console.log("");
  console.log("-".repeat(70));
  console.log("VERIFIKASI:");
  console.log("-".repeat(70));
  console.log("Username:", user.username);
  console.log("Stored Hash:", user.password_hash);
  console.log("Match:", user.password_hash === hash ? "✅ YES" : "❌ NO");

  db.close();

  console.log("");
  console.log("=".repeat(70));
  console.log("✅ SELESAI");
  console.log("=".repeat(70));
  console.log("");
  console.log("Login dengan:");
  console.log("  Username: gemi");
  console.log("  Password: 5555");
  console.log("");
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
