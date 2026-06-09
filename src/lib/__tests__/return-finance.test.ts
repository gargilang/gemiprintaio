/**
 * Cashbook AST formula tests for retur-related categories.
 *
 * The migration `20260525054928_commercial_workflows_v1.sql` ships AST blobs
 * that adjust the omzet (G), biaya_bahan (I), and saldo (J) columns whenever
 * a row's kategori_transaksi is RETUR_PENJUALAN, RETUR_HPP, or
 * RETUR_PEMBELIAN. The follow-up migration
 * `20260525130000_return_non_cash_revenue.sql` extends omzet/saldo to also
 * recognise RETUR_PENJUALAN_NONCASH (no cash impact, only omzet reversal).
 *
 * These tests load the same JSON blobs straight from the migration file so
 * we never drift out of sync with what the database actually runs.
 */

import fs from "node:fs";
import path from "node:path";
import { evaluateDataset } from "../ast/evaluator";
import type { ASTNode, InputRow } from "../ast/types";

function loadAst(filePath: string, columnKey: "G" | "I" | "J"): ASTNode {
  const sql = fs.readFileSync(filePath, "utf8");
  // Find every block of the shape:
  //   SET ast = '<json>'::jsonb,
  //       description = ...
  //   WHERE column_key = '<column>' OR ...
  // and pick the one whose WHERE matches the requested column_key.
  // NB: parses immutable historical migration files, which still use the
  // pre-rename table name `cashbook_formula` — do NOT change to rumus_buku_kas.
  const updateRegex =
    /UPDATE\s+cashbook_formula\s*SET\s+ast\s*=\s*'([\s\S]*?)'::jsonb,?[\s\S]*?WHERE\s+column_key\s*=\s*'([A-Z])'/g;
  let match: RegExpExecArray | null;
  let result: string | null = null;
  while ((match = updateRegex.exec(sql)) !== null) {
    if (match[2] === columnKey) {
      // Repeating pattern: blocks later in the file override earlier ones,
      // mimicking the order the SQL would execute.
      result = match[1];
    }
  }
  if (!result) throw new Error(`No AST update found for column ${columnKey} in ${filePath}`);
  return JSON.parse(result) as ASTNode;
}

const v1 = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260525054928_commercial_workflows_v1.sql"
);
const v2 = path.resolve(
  __dirname,
  "../../../supabase/migrations/20260525130000_return_non_cash_revenue.sql"
);

const omzetAst = loadAst(v2, "G");
const biayaBahanAst = loadAst(v1, "I");
const saldoAst = loadAst(v2, "J");

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
