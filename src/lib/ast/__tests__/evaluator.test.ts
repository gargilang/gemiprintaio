import {
  evaluate,
  evaluateDataset,
  sortFormulasByDependency,
} from "../evaluator";
import {
  DEFAULT_FORMULAS,
  DEFAULT_PARTNERS,
} from "../defaults";
import {
  type ASTNode,
  type InputRow,
  type PartnerDefinition,
} from "../types";

function emptyCtx(input: Partial<InputRow> = {}) {
  return {
    row: 2,
    input: { C: "", D: 0, E: 0, F: "", ...input },
    prevOutputs: {},
    currentOutputs: {},
    partners: {} as Record<string, PartnerDefinition>,
  };
}

describe("AST evaluator — atomic nodes", () => {
  test("literal returns its value", () => {
    expect(evaluate({ type: "literal", value: 42 }, emptyCtx())).toBe(42);
    expect(evaluate({ type: "literal", value: "hi" }, emptyCtx())).toBe("hi");
    expect(evaluate({ type: "literal", value: true }, emptyCtx())).toBe(true);
  });

  test("columnRef returns input column", () => {
    expect(
      evaluate({ type: "columnRef", column: "C" }, emptyCtx({ C: "OMZET" }))
    ).toBe("OMZET");
    expect(
      evaluate({ type: "columnRef", column: "D" }, emptyCtx({ D: 1500 }))
    ).toBe(1500);
  });

  test("row() returns the current row index", () => {
    const ctx = emptyCtx();
    ctx.row = 7;
    expect(evaluate({ type: "row" }, ctx)).toBe(7);
  });

  test("prevOutput defaults to 0 when missing", () => {
    expect(
      evaluate({ type: "prevOutput", column: "G" }, emptyCtx())
    ).toBe(0);
  });

  test("partnerRef returns partner name", () => {
    const ctx = emptyCtx();
    ctx.partners = { p1: { id: "p1", name: "Cahaya", displayOrder: 1 } };
    expect(
      evaluate({ type: "partnerRef", partnerId: "p1" }, ctx)
    ).toBe("Cahaya");
  });
});

describe("AST evaluator — logical operators", () => {
  test("IF picks the right branch", () => {
    const node: ASTNode = {
      type: "if",
      cond: { type: "literal", value: true },
      then: { type: "literal", value: "yes" },
      else: { type: "literal", value: "no" },
    };
    expect(evaluate(node, emptyCtx())).toBe("yes");

    const node2: ASTNode = {
      type: "if",
      cond: { type: "literal", value: 0 },
      then: { type: "literal", value: "yes" },
      else: { type: "literal", value: "no" },
    };
    expect(evaluate(node2, emptyCtx())).toBe("no");
  });

  test("SEARCH is case-insensitive and throws when missing", () => {
    const ctx = emptyCtx({ C: "OMZET HARIAN" });
    expect(
      evaluate(
        {
          type: "search",
          find: { type: "literal", value: "omzet" },
          within: { type: "columnRef", column: "C" },
        },
        ctx
      )
    ).toBeGreaterThan(0);

    expect(() =>
      evaluate(
        {
          type: "search",
          find: { type: "literal", value: "absen" },
          within: { type: "columnRef", column: "C" },
        },
        ctx
      )
    ).toThrow();
  });

  test("ISERROR catches SEARCH failure", () => {
    const ctx = emptyCtx({ C: "BIAYA" });
    expect(
      evaluate(
        {
          type: "iserror",
          arg: {
            type: "search",
            find: { type: "literal", value: "OMZET" },
            within: { type: "columnRef", column: "C" },
          },
        },
        ctx
      )
    ).toBe(true);
  });

  test("AND / OR short-circuit on truthy/falsy values", () => {
    const ctx = emptyCtx();
    expect(
      evaluate(
        {
          type: "and",
          left: { type: "literal", value: true },
          right: { type: "literal", value: 0 },
        },
        ctx
      )
    ).toBe(false);
    expect(
      evaluate(
        {
          type: "or",
          left: { type: "literal", value: 0 },
          right: { type: "literal", value: "x" },
        },
        ctx
      )
    ).toBe(true);
  });

  test("binaryOp arithmetic + comparisons", () => {
    const add = {
      type: "binaryOp",
      op: "+",
      left: { type: "literal", value: 3 },
      right: { type: "literal", value: 4 },
    } as const;
    expect(evaluate(add as ASTNode, emptyCtx())).toBe(7);

    const div = {
      type: "binaryOp",
      op: "/",
      left: { type: "literal", value: 10 },
      right: { type: "literal", value: 0 },
    } as const;
    expect(evaluate(div as ASTNode, emptyCtx())).toBe(0);

    const eqNode = {
      type: "binaryOp",
      op: "=",
      left: { type: "literal", value: "OMZET" },
      right: { type: "literal", value: "omzet" },
    } as const;
    expect(evaluate(eqNode as ASTNode, emptyCtx())).toBe(true);
  });
});

describe("Default formula dataset — reproduces original Sheets logic", () => {
  /**
   * Walk a representative dataset and verify each computed output column
   * matches a hand-rolled reference implementation of the original Sheets
   * formulas. This is the key correctness gate for the AST overhaul.
   */
  const rows: InputRow[] = [
    { C: "OMZET", D: 1_000_000, E: 0, F: "penjualan harian" },
    { C: "BIAYA", D: 0, E: 150_000, F: "Listrik" },
    { C: "SUPPLY", D: 0, E: 200_000, F: "Tinta" },
    { C: "INVESTOR", D: 500_000, E: 0, F: "Setoran Cahaya" },
    { C: "PRIBADI-S", D: 0, E: 50_000, F: "Kasbon Suri" },
    { C: "PIUTANG", D: 250_000, E: 0, F: "Pelunasan Andi" },
    { C: "BIAYA", D: 0, E: 75_000, F: "Pembelian Cahaya" },
  ];

  // Reference (hand-rolled) computation — translates the original Sheets
  // formulas directly so we can compare term-by-term.
  function reference() {
    const out: Array<Record<string, number>> = [];
    let G = 0;
    let H = 0;
    let I = 0;
    let J = 0;
    let L = 0;
    let N = 0;
    let O = 0;

    rows.forEach((r, i) => {
      const isFirst = i === 0;
      const D = r.D;
      const E = r.E;
      const C = r.C;
      const F = r.F.toLowerCase();
      const prevK = i === 0 ? 0 : out[i - 1].K;

      // G
      if (C.includes("OMZET") || C.includes("PIUTANG")) {
        G = isFirst ? D : G + D;
      } else {
        G = isFirst ? 0 : G;
      }

      // H
      if (isFirst) {
        H = C === "BIAYA" || C === "TABUNGAN" ? E : 0;
      } else {
        H = C === "BIAYA" || C === "TABUNGAN" ? H + E : H;
      }

      // I
      if (isFirst) {
        I = C === "SUPPLY" || C === "HUTANG" ? E : 0;
      } else {
        I = C === "SUPPLY" || C === "HUTANG" ? I + E : I;
      }

      // J
      J = isFirst ? D - E : J + D - E;

      // K
      const K = G - (H + I);

      // L
      if (C === "PRIBADI-S") {
        if (isFirst) {
          L = D ? -D : E;
        } else {
          L = D ? L - D : L + E;
        }
      } else {
        L = isFirst ? 0 : L;
      }

      // M
      const M = K / 2 - L;

      // N
      const incK = K - prevK;
      const prevN = isFirst ? 0 : out[i - 1].N;
      N = prevN + incK / 2;
      if (C === "INVESTOR") N += D - E;

      // O
      const hasCahaya = F.includes("cahaya");
      const catMatch = C === "INVESTOR" || C === "BIAYA";
      if (hasCahaya && catMatch) {
        if (isFirst) {
          O = D ? -D : E;
        } else {
          O = D ? O - D : O + E;
        }
      } else {
        O = isFirst ? 0 : O;
      }

      out.push({ G, H, I, J, K, L, M, N, O });
    });
    return out;
  }

  test("evaluateDataset matches hand-rolled reference for every row", () => {
    const expected = reference();
    const formulas = DEFAULT_FORMULAS.map((f) => ({
      column: f.column,
      ast: f.ast,
    }));
    const actual = evaluateDataset(rows, formulas, DEFAULT_PARTNERS);

    for (let i = 0; i < rows.length; i++) {
      for (const col of ["G", "H", "I", "J", "K", "L", "M", "N", "O"]) {
        expect(actual[i][col]).toBeCloseTo(expected[i][col], 6);
      }
    }
  });
});

describe("Dependency ordering", () => {
  test("formulas with outputRef are sorted after their dependencies", () => {
    const F = (column: string, ast: ASTNode) => ({ column, ast });
    const formulas = [
      F("K", { type: "outputRef", column: "G" }), // depends on G
      F("G", { type: "literal", value: 1 }),
      F("H", { type: "outputRef", column: "K" }), // depends on K
    ];
    const ordered = sortFormulasByDependency(formulas);
    const cols = ordered.map((f) => f.column);
    expect(cols.indexOf("G")).toBeLessThan(cols.indexOf("K"));
    expect(cols.indexOf("K")).toBeLessThan(cols.indexOf("H"));
  });
});
