import Database from "better-sqlite3";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_FILE = join(__dirname, "..", "database", "gemiprintaio.db");

const db = new Database(DB_FILE);

const id = randomUUID();
const username = "test_noemail_" + Math.floor(Math.random() * 100000);
const full_name = "Test No Email (DB)";
const password_hash =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA-256 of empty string (dummy)
const role = "user";
const is_active = 1;

const insert = db.prepare(`
  INSERT INTO profiles (id, username, email, full_name, password_hash, role, is_active)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insert.run(id, username, null, full_name, password_hash, role, is_active);

const row = db
  .prepare(
    `SELECT id, username, email, full_name, role, is_active FROM profiles WHERE id = ?`
  )
  .get(id);
console.log("Inserted:", row);
