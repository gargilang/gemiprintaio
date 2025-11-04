#!/usr/bin/env node
import Database from "better-sqlite3";

const db = new Database("./database/gemiprintaio.db");

console.log("First 10 transactions by created_at ASC:\n");

const rows = db
  .prepare(
    `
  SELECT tanggal, kategori_transaksi, keperluan, debit, kredit, created_at 
  FROM cash_book 
  WHERE archived_at IS NULL 
  ORDER BY created_at ASC 
  LIMIT 10
`
  )
  .all();

rows.forEach((r, i) => {
  console.log(`${i + 1}. [${r.kategori_transaksi}] ${r.keperluan}`);
  console.log(`   Date: ${r.tanggal}, Debit: ${r.debit}, Kredit: ${r.kredit}`);
  console.log(`   Created: ${r.created_at}\n`);
});

db.close();
