/**
 * Round-trip and edge-case tests for the AppSheet-style Expression DSL.
 *
 * Syntax rules:
 *   [nama]        → column or formula key reference
 *   FUNGSI(...)   → built-in function (case-insensitive parse, UPPERCASE print)
 *   "teks"        → string literal
 *   numbers       → numeric literal
 *   ? :           → ternary (prints as IF(...))
 *   && ||         → AND/OR (prints as AND(...)/OR(...))
 */

import {
  parseDsl,
  astToDsl,
  DEFAULT_INPUT_COLUMNS,
  buildLetterToKeyMap,
  normalizeAstColumns,
  type SymbolContext,
} from "../index";
import { DEFAULT_FORMULAS } from "../defaults";
import type { ASTNode } from "../types";

const DEFAULT_KEYS = DEFAULT_FORMULAS.map((f) => f.formulaKey ?? f.dbColumn);

const baseCtx: SymbolContext = {
  inputColumns: DEFAULT_INPUT_COLUMNS,
  formulaKeys: ["omzet", "biaya_operasional", "biaya_bahan", "saldo", "laba_bersih"],
};

// ── Parse tests ──────────────────────────────────────────────────────────────

describe("DSL parse / print (AppSheet-style)", () => {
  test("simple arithmetic with bracket refs", () => {
    const { ast, diagnostics } = parseDsl("[debit] - [kredit]", baseCtx);
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "binaryOp",
      op: "-",
      left: { type: "columnRef", column: "D" },
      right: { type: "columnRef", column: "E" },
    });
  });

  test("ternary becomes IF-AST", () => {
    const { ast, diagnostics } = parseDsl(
      "[omzet] > 0 ? [debit] * 0.05 : 0",
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "if",
      cond: {
        type: "binaryOp",
        op: ">",
        left: { type: "outputRef", column: "omzet" },
        right: { type: "literal", value: 0 },
      },
      then: {
        type: "binaryOp",
        op: "*",
        left: { type: "columnRef", column: "D" },
        right: { type: "literal", value: 0.05 },
      },
      else: { type: "literal", value: 0 },
    });
  });

  test("PREV([formula_key]) becomes prevOutput", () => {
    const { ast, diagnostics } = parseDsl(
      "PREV([saldo]) + [debit] - [kredit]",
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "binaryOp",
      op: "-",
      left: {
        type: "binaryOp",
        op: "+",
        left: { type: "prevOutput", column: "saldo" },
        right: { type: "columnRef", column: "D" },
      },
      right: { type: "columnRef", column: "E" },
    });
  });

  test("IF(...) function form", () => {
    const { ast, diagnostics } = parseDsl(
      "IF(ROW() == 2, 0, PREV([laba_bersih]))",
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "if",
      cond: {
        type: "binaryOp",
        op: "=",
        left: { type: "row" },
        right: { type: "literal", value: 2 },
      },
      then: { type: "literal", value: 0 },
      else: { type: "prevOutput", column: "laba_bersih" },
    });
  });

  test("SEARCH + ISERROR + NOT", () => {
    const { ast, diagnostics } = parseDsl(
      'NOT(ISERROR(SEARCH("OMZET", [kategori])))',
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "not",
      arg: {
        type: "iserror",
        arg: {
          type: "search",
          find: { type: "literal", value: "OMZET" },
          within: { type: "columnRef", column: "C" },
        },
      },
    });
  });

  test("AND/OR function form", () => {
    const { ast, diagnostics } = parseDsl(
      'AND([kategori] == "BIAYA", [debit] > 0)',
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "and",
      left: {
        type: "binaryOp",
        op: "=",
        left: { type: "columnRef", column: "C" },
        right: { type: "literal", value: "BIAYA" },
      },
      right: {
        type: "binaryOp",
        op: ">",
        left: { type: "columnRef", column: "D" },
        right: { type: "literal", value: 0 },
      },
    });
  });

  test("&& and || still accepted as aliases", () => {
    const { ast, diagnostics } = parseDsl(
      '[kategori] == "BIAYA" || [kategori] == "TABUNGAN"',
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "or",
      left: {
        type: "binaryOp",
        op: "=",
        left: { type: "columnRef", column: "C" },
        right: { type: "literal", value: "BIAYA" },
      },
      right: {
        type: "binaryOp",
        op: "=",
        left: { type: "columnRef", column: "C" },
        right: { type: "literal", value: "TABUNGAN" },
      },
    });
  });

  test("unary minus", () => {
    const { ast, diagnostics } = parseDsl("-[debit]", baseCtx);
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "negate",
      arg: { type: "columnRef", column: "D" },
    });
  });

  test("case-insensitive function names", () => {
    const { ast: a1 } = parseDsl("IF(true, 1, 0)", baseCtx);
    const { ast: a2 } = parseDsl("if(true, 1, 0)", baseCtx);
    const { ast: a3 } = parseDsl("If(true, 1, 0)", baseCtx);
    expect(JSON.stringify(a1)).toEqual(JSON.stringify(a2));
    expect(JSON.stringify(a1)).toEqual(JSON.stringify(a3));
  });

  test("comments are ignored", () => {
    const { ast, diagnostics } = parseDsl(
      "// header\n[debit] + [kredit] // trailing",
      baseCtx
    );
    expect(diagnostics).toEqual([]);
    expect(ast).toEqual({
      type: "binaryOp",
      op: "+",
      left: { type: "columnRef", column: "D" },
      right: { type: "columnRef", column: "E" },
    });
  });
});

// ── Diagnostics ──────────────────────────────────────────────────────────────

describe("DSL diagnostics (AppSheet-style)", () => {
  test("unknown identifier in brackets suggests nearest match", () => {
    const { diagnostics } = parseDsl("[omzed]", baseCtx);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message).toMatch(/omzed/);
    expect(diagnostics[0].hint).toBe('Maksudnya "omzet"?');
  });

  test("bare ident that is a known column gets bracket hint", () => {
    const { diagnostics } = parseDsl("omzet + 1", baseCtx);
    expect(diagnostics.some((d) => d.message.includes("[omzet]"))).toBe(true);
  });

  test("unknown function suggests nearest", () => {
    const { diagnostics } = parseDsl("IFX(1, 2, 3)", baseCtx);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].hint).toBe('Maksudnya "IF"?');
  });

  test("PREV with non-outputRef raises diagnostic", () => {
    const { diagnostics } = parseDsl("PREV(123)", baseCtx);
    expect(diagnostics.some((d) => d.message.includes("PREV"))).toBe(true);
  });

  test("unterminated string", () => {
    const { diagnostics } = parseDsl('"unclosed', baseCtx);
    expect(diagnostics.some((d) => d.message.includes("kutip"))).toBe(true);
  });

  test("single = becomes equality with hint", () => {
    const { diagnostics } = parseDsl("[omzet] = 0", baseCtx);
    expect(diagnostics.some((d) => d.message.includes('"=="'))).toBe(true);
  });

  test("missing close bracket", () => {
    const { diagnostics } = parseDsl("[debit", baseCtx);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test("missing close paren", () => {
    const { diagnostics } = parseDsl("([debit] + 1", baseCtx);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test("empty input", () => {
    const { ast, diagnostics } = parseDsl("   ", baseCtx);
    expect(ast).toBeNull();
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test("trailing junk", () => {
    const { diagnostics } = parseDsl("1 + 2 oops", baseCtx);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

// ── Printer output ───────────────────────────────────────────────────────────

describe("printer output (AppSheet-style)", () => {
  test("columnRef prints as [alias]", () => {
    const ast: ASTNode = { type: "columnRef", column: "D" };
    expect(astToDsl(ast, baseCtx)).toBe("[debit]");
  });

  test("outputRef prints as [formulaKey]", () => {
    const ast: ASTNode = { type: "outputRef", column: "omzet" };
    expect(astToDsl(ast, baseCtx)).toBe("[omzet]");
  });

  test("prevOutput prints as PREV([formulaKey])", () => {
    const ast: ASTNode = { type: "prevOutput", column: "saldo" };
    expect(astToDsl(ast, baseCtx)).toBe("PREV([saldo])");
  });

  test("row prints as ROW()", () => {
    const ast: ASTNode = { type: "row" };
    expect(astToDsl(ast, baseCtx)).toBe("ROW()");
  });

  test("if prints as IF(...)", () => {
    const ast: ASTNode = {
      type: "if",
      cond: { type: "literal", value: true },
      then: { type: "literal", value: 1 },
      else: { type: "literal", value: 2 },
    };
    expect(astToDsl(ast, baseCtx)).toBe("IF(true, 1, 2)");
  });

  test("and prints as AND(...)", () => {
    const ast: ASTNode = {
      type: "and",
      left: { type: "literal", value: true },
      right: { type: "literal", value: false },
    };
    expect(astToDsl(ast, baseCtx)).toBe("AND(true, false)");
  });

  test("or prints as OR(...)", () => {
    const ast: ASTNode = {
      type: "or",
      left: { type: "literal", value: true },
      right: { type: "literal", value: false },
    };
    expect(astToDsl(ast, baseCtx)).toBe("OR(true, false)");
  });

  test("not prints as NOT(...)", () => {
    const ast: ASTNode = {
      type: "not",
      arg: { type: "literal", value: true },
    };
    expect(astToDsl(ast, baseCtx)).toBe("NOT(true)");
  });

  test("search prints as SEARCH(...)", () => {
    const ast: ASTNode = {
      type: "search",
      find: { type: "literal", value: "OMZET" },
      within: { type: "columnRef", column: "C" },
    };
    expect(astToDsl(ast, baseCtx)).toBe('SEARCH("OMZET", [kategori])');
  });

  test("multiplication before addition (no extra parens)", () => {
    const ast: ASTNode = {
      type: "binaryOp",
      op: "+",
      left: { type: "columnRef", column: "D" },
      right: {
        type: "binaryOp",
        op: "*",
        left: { type: "columnRef", column: "E" },
        right: { type: "literal", value: 2 },
      },
    };
    expect(astToDsl(ast, baseCtx)).toBe("[debit] + [kredit] * 2");
  });

  test("right-associative subtraction parenthesised", () => {
    const ast: ASTNode = {
      type: "binaryOp",
      op: "-",
      left: { type: "literal", value: 1 },
      right: {
        type: "binaryOp",
        op: "-",
        left: { type: "literal", value: 2 },
        right: { type: "literal", value: 3 },
      },
    };
    expect(astToDsl(ast, baseCtx)).toBe("1 - (2 - 3)");
  });
});

// ── Round-trip with default formulas ─────────────────────────────────────────

describe("printer round-trip with default formulas", () => {
  for (const f of DEFAULT_FORMULAS) {
    test(`${f.name} round-trips`, () => {
      const ctx: SymbolContext = {
        inputColumns: DEFAULT_INPUT_COLUMNS,
        formulaKeys: DEFAULT_KEYS as string[],
      };
      const letterToKey = buildLetterToKeyMap(DEFAULT_FORMULAS);
      const normalised = normalizeAstColumns(f.ast, letterToKey);
      const text = astToDsl(normalised, ctx);
      const { ast: parsed, diagnostics } = parseDsl(text, ctx);
      expect(diagnostics).toEqual([]);
      expect(parsed).toEqual(normalised);
    });
  }
});
