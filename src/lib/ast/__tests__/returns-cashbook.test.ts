import { evaluateDataset } from "../evaluator";
import { DEFAULT_FORMULAS } from "../defaults";
import type { InputRow, PartnerDefinition } from "../types";

const NO_PARTNERS: PartnerDefinition[] = [];

const formulas = DEFAULT_FORMULAS.map((f) => ({
  column: f.column,
  ast: f.ast,
}));

describe("Cashbook AST - return categories", () => {
  test("sales return refund lowers saldo and omzet, while RETUR_HPP reverses HPP only", () => {
    const rows: InputRow[] = [
      { C: "OMZET", D: 1_000_000, E: 0, F: "INV-001 [REF:sale-1]" },
      { C: "HPP", D: 0, E: 600_000, F: "HPP INV-001 [REF:sale-1]" },
      { C: "RETUR_PENJUALAN", D: 0, E: 200_000, F: "RJ-001 [REF:return-1]" },
      { C: "RETUR_HPP", D: 120_000, E: 0, F: "HPP Balik RJ-001 [REF:return-1]" },
    ];

    const out = evaluateDataset(rows, formulas, NO_PARTNERS);

    expect(out[0].G).toBe(1_000_000);
    expect(out[0].J).toBe(1_000_000);

    expect(out[1].I).toBe(600_000);
    expect(out[1].J).toBe(1_000_000);

    expect(out[2].G).toBe(800_000);
    expect(out[2].J).toBe(800_000);

    expect(out[3].I).toBe(480_000);
    expect(out[3].J).toBe(800_000);
    expect(out[3].K).toBe(320_000);
  });

  test("purchase return vendor refund increases saldo without reducing biaya_bahan", () => {
    const rows: InputRow[] = [
      { C: "HPP", D: 0, E: 500_000, F: "HPP INV-001 [REF:sale-1]" },
      { C: "RETUR_PEMBELIAN", D: 125_000, E: 0, F: "RP-001 [REF:return-1]" },
    ];

    const out = evaluateDataset(rows, formulas, NO_PARTNERS);

    expect(out[0].I).toBe(500_000);
    expect(out[0].J).toBe(0);

    expect(out[1].I).toBe(500_000);
    expect(out[1].J).toBe(125_000);
    expect(out[1].K).toBe(-500_000);
  });

  test("non-cash sales return lowers omzet without moving saldo", () => {
    const rows: InputRow[] = [
      { C: "OMZET", D: 250_000, E: 0, F: "INV-002 [REF:sale-2]" },
      { C: "RETUR_PENJUALAN_NONCASH", D: 0, E: 80_000, F: "RJ-002 [REF:return-2]" },
    ];

    const out = evaluateDataset(rows, formulas, NO_PARTNERS);

    expect(out[1].G).toBe(170_000);
    expect(out[1].J).toBe(250_000);
    expect(out[1].K).toBe(170_000);
  });
});
