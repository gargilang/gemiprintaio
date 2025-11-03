import Database from "better-sqlite3";
import { join } from "path";

const db = new Database(join(process.cwd(), "database", "gemiprintaio.db"));
const rows = db
  .prepare(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','view','trigger') ORDER BY type, name"
  )
  .all();
for (const r of rows) {
  console.log(`${r.type}: ${r.name} on ${r.tbl_name}`);
}
console.log("\n--- Objects referencing profiles_old ---");
for (const r of rows) {
  if (r.sql && r.sql.includes("profiles_old")) {
    console.log(`${r.type}: ${r.name}\n${r.sql}\n`);
  }
}
