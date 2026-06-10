/**
 * Regresi: formula "Bagi Hasil <orang>" (profit_share) harus membaca
 * laba_bersih baris yang sama lewat outputRef.
 *
 * Formula actor merujuk formula sistem via formulaKey (mis. "laba_bersih"),
 * BUKAN huruf kolom ("K"). Engine recalc harus mengindeks output baris saat
 * ini dengan formulaKey juga, kalau tidak outputRef("laba_bersih") resolve ke
 * 0 dan bagi hasil selalu Rp 0 (bug yang dilaporkan owner: omzet 230rb, biaya
 * maklon 180rb, laba 50rb, tapi bagi hasil Gemi & Suri = 0).
 */

import { computeCashbookRecalculationUpdates } from "../cashbook-recalc";
import { DEFAULT_FORMULAS } from "../defaults";
import type { ASTNode, FormulaDefinition } from "../types";
import type { CashbookRecalcInputRow } from "../cashbook-recalc";

const outputRef = (key: string): ASTNode => ({ type: "outputRef", column: key });
const lit = (v: number): ASTNode => ({ type: "literal", value: v });
const mul = (l: ASTNode, r: ASTNode): ASTNode => ({
  type: "binaryOp",
  op: "*",
  left: l,
  right: r,
});

/** Bagi hasil = laba_bersih × (percent / 100). */
function bagiHasilFormula(
  id: string,
  percent: number,
  column: string
): FormulaDefinition {
  return {
    id,
    name: `Bagi Hasil ${id}`,
    column,
    dbColumn: `bagi_hasil_${id}`,
    formulaKey: `bagi_hasil_${id}`,
    actorId: `actor-${id}`,
    formulaGroup: "profit_share",
    ast: mul(outputRef("laba_bersih"), mul(lit(percent), lit(0.01))),
    enabled: true,
    isSystem: false,
    displayOrder: 100,
    description: `${percent}% dari laba bersih.`,
  };
}

function row(
  partial: Partial<CashbookRecalcInputRow> & {
    kategori_transaksi: string;
    debit: number;
    kredit: number;
  },
  i: number
): CashbookRecalcInputRow {
  return {
    id: `row-${i}`,
    tanggal: "2026-06-10",
    urutan_tampilan: i,
    dibuat_pada: `2026-06-10T00:00:0${i}Z`,
    keperluan: "",
    ...partial,
  };
}

describe("Recalc — bagi hasil membaca laba_bersih baris yang sama", () => {
  test("omzet 230rb, HPP maklon 180rb → laba 50rb → bagi hasil 50% = 25rb", () => {
    const rows: CashbookRecalcInputRow[] = [
      row({ kategori_transaksi: "OMZET", debit: 230_000, kredit: 0, keperluan: "Penjualan INV-1 [REF:s1]" }, 1),
      row({ kategori_transaksi: "HPP", debit: 0, kredit: 180_000, keperluan: "HPP INV-1 [REF:s1]" }, 2),
      row({ kategori_transaksi: "MAKLON", debit: 0, kredit: 180_000, keperluan: "Maklon INV-1 [REF:m1]" }, 3),
    ];

    const formulas: FormulaDefinition[] = [
      ...DEFAULT_FORMULAS,
      bagiHasilFormula("gemi", 50, "P"),
      bagiHasilFormula("suri", 50, "Q"),
    ];

    const out = computeCashbookRecalculationUpdates(rows, formulas);
    const last = out[out.length - 1].outputs;

    // Laba bersih = 230rb - (0 + 180rb) = 50rb.
    expect(last["K"]).toBe(50_000);
    // Bagi hasil 50% dari laba 50rb = 25rb (BUKAN 0).
    expect(out[out.length - 1].computed["bagi_hasil_gemi"]).toBe(25_000);
    expect(out[out.length - 1].computed["bagi_hasil_suri"]).toBe(25_000);
  });
});
