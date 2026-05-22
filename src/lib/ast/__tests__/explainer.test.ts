/**
 * Tests for the AST → Bahasa Indonesia explainer.
 *
 * Goals:
 *   1. Default formulas produce non-empty narratives.
 *   2. Idiomatic patterns (`IF(ROW() == 2, ...)`,
 *      `NOT(ISERROR(SEARCH(...)))`) yield natural sentences.
 *   3. Literal types (number, string, boolean) format correctly.
 *   4. Unmapped formula keys fall back to a Title-Cased label.
 */

import { explainAst, type ExplainContext } from "../explainer";
import { DEFAULT_FORMULAS } from "../defaults";
import { buildLetterToKeyMap, normalizeAstColumns } from "../normalize";
import type { ASTNode } from "../types";

const ctx: ExplainContext = {
  columnLabels: {
    C: "Kategori",
    D: "Debit",
    E: "Kredit",
    F: "Keperluan",
  },
  formulaLabels: {
    omzet: "Omzet",
    biaya_operasional: "Biaya Operasional",
    biaya_bahan: "Biaya Bahan",
    saldo: "Saldo",
    laba_bersih: "Laba Bersih",
  },
};

describe("explainAst — default formulas produce non-empty narratives", () => {
  for (const f of DEFAULT_FORMULAS) {
    test(`${f.name} explains`, () => {
      const normalized = normalizeAstColumns(f.ast, buildLetterToKeyMap(DEFAULT_FORMULAS));
      const text = explainAst(normalized, ctx);
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(10);
      // Must end with a period.
      expect(text).toMatch(/\.$/);
    });
  }
});

describe("explainAst — idiomatic patterns", () => {
  test("IF(ROW() == 2, A, B) → 'Pada baris pertama, ...'", () => {
    const ast: ASTNode = {
      type: "if",
      cond: {
        type: "binaryOp",
        op: "=",
        left: { type: "row" },
        right: { type: "literal", value: 2 },
      },
      then: {
        type: "binaryOp",
        op: "-",
        left: { type: "columnRef", column: "D" },
        right: { type: "columnRef", column: "E" },
      },
      else: {
        type: "binaryOp",
        op: "+",
        left: { type: "prevOutput", column: "saldo" },
        right: {
          type: "binaryOp",
          op: "-",
          left: { type: "columnRef", column: "D" },
          right: { type: "columnRef", column: "E" },
        },
      },
    };
    const text = explainAst(ast, ctx);
    expect(text).toContain("Pada baris pertama");
    expect(text).toContain("Debit dikurangi Kredit");
    expect(text).toContain("Saldo dari baris sebelumnya");
  });

  test("NOT(ISERROR(SEARCH(\"X\", [col]))) → '... mengandung X'", () => {
    const ast: ASTNode = {
      type: "not",
      arg: {
        type: "iserror",
        arg: {
          type: "search",
          find: { type: "literal", value: "OMZET" },
          within: { type: "columnRef", column: "C" },
        },
      },
    };
    const text = explainAst(ast, ctx);
    expect(text).toContain("Kategori mengandung");
    expect(text).toContain("OMZET");
  });

  test("OR-chain of contains becomes comma list", () => {
    // IF(OR(NOT(ISERROR(SEARCH("OMZET", C))), NOT(ISERROR(SEARCH("PIUTANG", C)))), A, B)
    const containsOmzet: ASTNode = {
      type: "not",
      arg: {
        type: "iserror",
        arg: {
          type: "search",
          find: { type: "literal", value: "OMZET" },
          within: { type: "columnRef", column: "C" },
        },
      },
    };
    const containsPiutang: ASTNode = {
      type: "not",
      arg: {
        type: "iserror",
        arg: {
          type: "search",
          find: { type: "literal", value: "PIUTANG" },
          within: { type: "columnRef", column: "C" },
        },
      },
    };
    const ast: ASTNode = {
      type: "if",
      cond: { type: "or", left: containsOmzet, right: containsPiutang },
      then: { type: "literal", value: 1 },
      else: { type: "literal", value: 0 },
    };
    const text = explainAst(ast, ctx);
    expect(text).toContain("Kategori mengandung");
    expect(text).toContain("OMZET");
    expect(text).toContain("PIUTANG");
    expect(text).toContain("atau");
  });
});

describe("explainAst — literal formatting", () => {
  test("string literal keeps quotes", () => {
    expect(explainAst({ type: "literal", value: "OMZET" }, ctx)).toBe('"OMZET".');
  });

  test("boolean literals", () => {
    expect(explainAst({ type: "literal", value: true }, ctx)).toBe("Benar.");
    expect(explainAst({ type: "literal", value: false }, ctx)).toBe("Salah.");
  });

  test("small numbers render plainly", () => {
    expect(explainAst({ type: "literal", value: 5 }, ctx)).toBe("5.");
    expect(explainAst({ type: "literal", value: 0.05 }, ctx)).toBe("0.05.");
  });

  test("large integers get thousand separators", () => {
    expect(explainAst({ type: "literal", value: 1500000 }, ctx)).toContain(".");
    expect(explainAst({ type: "literal", value: 1500000 }, ctx)).toMatch(/1\.500\.000/);
  });
});

describe("explainAst — unmapped keys fall back to Title Case", () => {
  test("unknown formula_key", () => {
    const ast: ASTNode = { type: "outputRef", column: "kasbon_andi_sales" };
    const text = explainAst(ast, {});
    expect(text).toBe("Kasbon Andi Sales.");
  });

  test("unknown formula_key in prevOutput", () => {
    const ast: ASTNode = { type: "prevOutput", column: "bonus_akhir_tahun" };
    const text = explainAst(ast, {});
    expect(text).toBe("Bonus Akhir Tahun dari baris sebelumnya.");
  });
});

describe("explainAst — generic operators", () => {
  test("comparison verbs", () => {
    const ast: ASTNode = {
      type: "binaryOp",
      op: ">",
      left: { type: "outputRef", column: "omzet" },
      right: { type: "literal", value: 0 },
    };
    expect(explainAst(ast, ctx)).toBe("Omzet lebih besar dari 0.");
  });

  test("multiplication", () => {
    const ast: ASTNode = {
      type: "binaryOp",
      op: "*",
      left: { type: "outputRef", column: "omzet" },
      right: { type: "literal", value: 0.05 },
    };
    expect(explainAst(ast, ctx)).toBe("Omzet dikali 0.05.");
  });
});
