/**
 * Cashbook AST formula tests for retur-related categories.
 *
 * The cashbook formulas adjust the omzet (G), biaya_bahan (I), and saldo (J)
 * columns whenever a row's kategori_transaksi is RETUR_PENJUALAN, RETUR_HPP,
 * RETUR_PEMBELIAN, or RETUR_PENJUALAN_NONCASH (the last one reverses omzet
 * only, with no cash impact on saldo).
 *
 * These tests load the same JSON blobs straight from the canonical seed file
 * (`supabase/seed-default-values.sql`, table `rumus_buku_kas`) so we never
 * drift out of sync with what the database actually runs. The seed is now the
 * single source of truth after the migrations were collapsed into one baseline
 * checkpoint.
 */

import fs from "node:fs";
import path from "node:path";
import { evaluateDataset } from "../ast/evaluator";
import type { ASTNode, InputRow } from "../ast/types";

const SEED_PATH = path.resolve(
  __dirname,
  "../../../supabase/seed-default-values.sql"
);

function loadAst(columnKey: "G" | "I" | "J"): ASTNode {
  const sql = fs.readFileSync(SEED_PATH, "utf8");
  // Each rumus_buku_kas row is inserted as:
  //   ('<id>', '<name>', '<column_key>', '<db_column>', '<ast-json>', true|false, ...)
  // The AST is the 5th single-quoted field. Match by column_key and capture
  // the JSON blob (JSON uses double quotes, so the closing }' is unambiguous).
  const re = new RegExp(
    `'[^']*',\\s*'[^']*',\\s*'${columnKey}',\\s*'[^']*',\\s*'(\\{[\\s\\S]*?\\})',\\s*(?:true|false)`
  );
  const match = sql.match(re);
  if (!match) {
    throw new Error(`No AST found for column ${columnKey} in ${SEED_PATH}`);
  }
  return JSON.parse(match[1]) as ASTNode;
}

const omzetAst = loadAst("G");
const biayaBahanAst = loadAst("I");
const saldoAst = loadAst("J");

const formulas = [
  { column: "G", ast: omzetAst },
  { column: "I", ast: biayaBahanAst },
  { column: "J", ast: saldoAst },
];

function omzetSequence(rows: InputRow[]): number[] {
  return evaluateDataset(rows, formulas).map((row) => Number(row.G || 0));
}
function hppSequence(rows: InputRow[]): number[] {
  return evaluateDataset(rows, formulas).map((row) => Number(row.I || 0));
}
function saldoSequence(rows: InputRow[]): number[] {
  return evaluateDataset(rows, formulas).map((row) => Number(row.J || 0));
}

describe("AST buku kas: kontribusi metrik terkait retur", () => {
  it("RETUR_PENJUALAN mengurangi omzet dan saldo saat refund tunai", () => {
    const rows: InputRow[] = [
      { C: "OMZET", D: 100000, E: 0, F: "Inv-1" },
      { C: "RETUR_PENJUALAN", D: 0, E: 30000, F: "Refund Inv-1" },
    ];
    expect(omzetSequence(rows)).toEqual([100000, 70000]);
    expect(saldoSequence(rows)).toEqual([100000, 70000]);
  });

  it("RETUR_PENJUALAN_NONCASH mengurangi omzet tanpa menyentuh saldo", () => {
    const rows: InputRow[] = [
      { C: "OMZET", D: 100000, E: 0, F: "Inv-1" },
      { C: "RETUR_PENJUALAN_NONCASH", D: 0, E: 40000, F: "Pengurangan piutang Inv-1" },
    ];
    expect(omzetSequence(rows)).toEqual([100000, 60000]);
    // Saldo holds steady because the non-cash row contributes 0 to J.
    expect(saldoSequence(rows)).toEqual([100000, 100000]);
  });

  it("RETUR_HPP mengurangi biaya_bahan tapi tidak saldo", () => {
    const rows: InputRow[] = [
      { C: "HPP", D: 0, E: 60000, F: "HPP Inv-1" },
      { C: "RETUR_HPP", D: 25000, E: 0, F: "Pembalik HPP Inv-1" },
    ];
    expect(hppSequence(rows)).toEqual([60000, 35000]);
    // HPP / RETUR_HPP rows are skipped by the saldo formula (kas not affected).
    expect(saldoSequence(rows)).toEqual([0, 0]);
  });

  it("RETUR_PEMBELIAN refund masuk ke saldo sebagai debit (arus kas masuk)", () => {
    const rows: InputRow[] = [
      { C: "BIAYA", D: 0, E: 50000, F: "Pembelian" },
      { C: "RETUR_PEMBELIAN", D: 12000, E: 0, F: "Refund vendor" },
    ];
    // omzet is unaffected by RETUR_PEMBELIAN
    expect(omzetSequence(rows)).toEqual([0, 0]);
    // saldo: -50000 then +12000 = -38000
    expect(saldoSequence(rows)).toEqual([-50000, -38000]);
  });

  it("Skenario campuran: retur tunai + non-tunai menghasilkan nilai kumulatif yang benar", () => {
    const rows: InputRow[] = [
      { C: "OMZET", D: 100000, E: 0, F: "Inv cash" },
      { C: "PIUTANG", D: 200000, E: 0, F: "Inv credit" },
      { C: "RETUR_PENJUALAN", D: 0, E: 20000, F: "Refund cash inv" },
      { C: "RETUR_PENJUALAN_NONCASH", D: 0, E: 50000, F: "Pengurangan piutang" },
    ];
    // Omzet running: 100000 → 300000 → 280000 → 230000
    expect(omzetSequence(rows)).toEqual([100000, 300000, 280000, 230000]);
    // Saldo running: 100000 → 300000 → 280000 → 280000 (non-cash skipped)
    expect(saldoSequence(rows)).toEqual([100000, 300000, 280000, 280000]);
  });
});
