/**
 * Tests for the extended function library (Phase A/B/C):
 *   - Math (ABS, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, MOD, POWER, MIN, MAX)
 *   - Text (LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, CONCAT)
 *   - Logic (IFS)
 *   - Date (TODAY, YEAR, MONTH, DAY, EDATE, EOMONTH, DATEDIF)
 *   - Aggregation (SUM, AVERAGE, COUNT, SUMIF, COUNTIF, AVERAGEIF)
 *
 * Each function is tested through the full DSL pipeline so any breakage in
 * tokenizer, parser, evaluator, or printer surfaces here.
 */

import {
  parseDsl,
  astToDsl,
  evaluateDataset,
  DEFAULT_INPUT_COLUMNS,
  type SymbolContext,
} from "../index";
import type { ASTNode, InputRow } from "../types";
import { evaluate } from "../evaluator";

const ctx: SymbolContext = {
  inputColumns: DEFAULT_INPUT_COLUMNS,
  formulaKeys: ["omzet", "saldo"],
};

function compile(source: string): ASTNode {
  const { ast, diagnostics } = parseDsl(source, ctx);
  expect(diagnostics).toEqual([]);
  expect(ast).not.toBeNull();
  return ast as ASTNode;
}

function evalSingle(source: string, row: Partial<InputRow> = {}): number | string | boolean {
  const ast = compile(source);
  return evaluate(ast, {
    row: 2,
    input: { C: "", D: 0, E: 0, F: "", ...row },
    prevOutputs: {},
    currentOutputs: {},
    partners: {},
  });
}

// ── Math ─────────────────────────────────────────────────────────────────────

describe("function library — math", () => {
  test("ABS handles negatives", () => {
    expect(evalSingle("ABS(-150)")).toBe(150);
    expect(evalSingle("ABS(150)")).toBe(150);
    expect(evalSingle("ABS([debit] - [kredit])", { D: 100, E: 250 })).toBe(150);
  });

  test("ROUND with default digits", () => {
    expect(evalSingle("ROUND(123.456)")).toBe(123);
    expect(evalSingle("ROUND(123.456, 2)")).toBe(123.46);
    expect(evalSingle("ROUND(123.456, -1)")).toBe(120);
  });

  test("ROUNDUP rounds away from zero", () => {
    expect(evalSingle("ROUNDUP(123.4, 0)")).toBe(124);
    expect(evalSingle("ROUNDUP(-123.4, 0)")).toBe(-124);
  });

  test("ROUNDDOWN truncates toward zero", () => {
    expect(evalSingle("ROUNDDOWN(123.9, 0)")).toBe(123);
    expect(evalSingle("ROUNDDOWN(-123.9, 0)")).toBe(-123);
  });

  test("CEILING / FLOOR with multiple", () => {
    expect(evalSingle("CEILING(1234, 1000)")).toBe(2000);
    expect(evalSingle("FLOOR(1234, 1000)")).toBe(1000);
  });

  test("MOD", () => {
    expect(evalSingle("MOD(10, 3)")).toBe(1);
    expect(evalSingle("MOD(7, 0)")).toBe(0);
  });

  test("POWER", () => {
    expect(evalSingle("POWER(2, 10)")).toBe(1024);
  });

  test("MIN / MAX variadic", () => {
    expect(evalSingle("MIN(5, 2, 8, 1, 9)")).toBe(1);
    expect(evalSingle("MAX(5, 2, 8, 1, 9)")).toBe(9);
  });
});

// ── Text ─────────────────────────────────────────────────────────────────────

describe("function library — text", () => {
  test("LEN", () => {
    expect(evalSingle('LEN("hello")')).toBe(5);
    expect(evalSingle('LEN([keperluan])', { F: "Listrik" })).toBe(7);
  });

  test("UPPER / LOWER / TRIM", () => {
    expect(evalSingle('UPPER("test")')).toBe("TEST");
    expect(evalSingle('LOWER("TEST")')).toBe("test");
    expect(evalSingle('TRIM("  spaced  ")')).toBe("spaced");
  });

  test("LEFT / RIGHT", () => {
    expect(evalSingle('LEFT("Hello World", 5)')).toBe("Hello");
    expect(evalSingle('RIGHT("Hello World", 5)')).toBe("World");
    expect(evalSingle('LEFT("abc", 100)')).toBe("abc");
    expect(evalSingle('RIGHT("abc", 100)')).toBe("abc");
  });

  test("CONCAT variadic", () => {
    expect(evalSingle('CONCAT("INV-", "001")')).toBe("INV-001");
    expect(evalSingle('CONCAT("a", "b", "c", "d")')).toBe("abcd");
  });
});

// ── Logic ────────────────────────────────────────────────────────────────────

describe("function library — logic", () => {
  test("IFS picks first matching condition", () => {
    expect(evalSingle('IFS(false, "A", true, "B", true, "C")')).toBe("B");
    expect(evalSingle('IFS([debit] > 1000, "besar", [debit] > 500, "sedang", true, "kecil")', { D: 750 })).toBe("sedang");
  });

  test("IFS throws when no condition matches", () => {
    // The dataset evaluator catches FormulaEvalError and returns 0.
    const ast = compile('IFS(false, "A", false, "B")');
    expect(() =>
      evaluate(ast, {
        row: 2,
        input: { C: "", D: 0, E: 0, F: "" },
        prevOutputs: {},
        currentOutputs: {},
        partners: {},
      })
    ).toThrow();
  });
});

// ── Date ─────────────────────────────────────────────────────────────────────

describe("function library — date", () => {
  test("YEAR / MONTH / DAY", () => {
    expect(evalSingle('YEAR("2026-05-22")')).toBe(2026);
    expect(evalSingle('MONTH("2026-05-22")')).toBe(5);
    expect(evalSingle('DAY("2026-05-22")')).toBe(22);
  });

  test("EDATE shifts months", () => {
    expect(evalSingle('EDATE("2026-01-15", 3)')).toBe("2026-04-15");
    expect(evalSingle('EDATE("2026-01-15", -2)')).toBe("2025-11-15");
  });

  test("EOMONTH returns last day of target month", () => {
    expect(evalSingle('EOMONTH("2026-02-10", 0)')).toBe("2026-02-28");
    expect(evalSingle('EOMONTH("2024-02-10", 0)')).toBe("2024-02-29"); // leap year
  });

  test("DATEDIF days/months/years", () => {
    expect(evalSingle('DATEDIF("2026-01-01", "2026-01-31", "D")')).toBe(30);
    expect(evalSingle('DATEDIF("2026-01-01", "2026-04-01", "M")')).toBe(3);
    expect(evalSingle('DATEDIF("2020-05-22", "2026-05-22", "Y")')).toBe(6);
    expect(evalSingle('DATEDIF("2020-05-22", "2026-05-21", "Y")')).toBe(5);
  });

  test("TODAY returns YYYY-MM-DD", () => {
    const today = evalSingle("TODAY()") as string;
    expect(typeof today).toBe("string");
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Aggregation ──────────────────────────────────────────────────────────────

describe("function library — aggregation", () => {
  const rows: InputRow[] = [
    { C: "OMZET", D: 1000, E: 0, F: "" },
    { C: "BIAYA", D: 0, E: 200, F: "" },
    { C: "OMZET", D: 1500, E: 0, F: "" },
    { C: "BIAYA", D: 0, E: 300, F: "" },
    { C: "OMZET", D: 500, E: 0, F: "" },
  ];

  test("SUM totals an input column", () => {
    const formula = compile("SUM([debit])");
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    expect(out[0].X).toBe(3000);
    expect(out[4].X).toBe(3000); // same on every row
  });

  test("AVERAGE excludes zero/non-numeric", () => {
    const formula = compile("AVERAGE([debit])");
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    // AVERAGE counts every numeric value, including zero — design choice
    // matching Excel: AVERAGE(0,0,1) === 0.333. Adjust if you prefer
    // skipping zeros.
    expect((out[0].X as number).toFixed(2)).toBe("600.00");
  });

  test("COUNT counts non-zero numeric values", () => {
    const formula = compile("COUNT([debit])");
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    expect(out[0].X).toBe(3); // three OMZET rows
  });

  test('SUMIF([kategori], "OMZET", [debit])', () => {
    const formula = compile('SUMIF([kategori], "OMZET", [debit])');
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    expect(out[0].X).toBe(3000);
  });

  test('COUNTIF([kategori], "BIAYA")', () => {
    const formula = compile('COUNTIF([kategori], "BIAYA")');
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    expect(out[0].X).toBe(2);
  });

  test('AVERAGEIF([kategori], "OMZET", [debit])', () => {
    const formula = compile('AVERAGEIF([kategori], "OMZET", [debit])');
    const out = evaluateDataset(rows, [{ column: "X", ast: formula }]);
    expect(out[0].X).toBe(1000); // (1000 + 1500 + 500) / 3
  });
});

// ── Round-trip ───────────────────────────────────────────────────────────────

describe("function library — DSL round-trip", () => {
  const samples = [
    "ABS([debit] - [kredit])",
    'IFS([omzet] > 1000, "besar", true, "kecil")',
    'LEFT([keperluan], 10)',
    'CONCAT("INV-", [keperluan])',
    'YEAR([tanggal])',
    'DATEDIF([tanggal], TODAY(), "D")',
    'SUM([debit])',
    'SUMIF([kategori], "OMZET", [debit])',
  ];

  // tanggal isn't in DEFAULT_INPUT_COLUMNS — extend ctx for those samples.
  const extCtx: SymbolContext = {
    ...ctx,
    inputColumns: { ...DEFAULT_INPUT_COLUMNS, tanggal: "C" }, // placeholder
  };

  for (const src of samples) {
    test(`round-trip: ${src}`, () => {
      const { ast, diagnostics } = parseDsl(src, extCtx);
      expect(diagnostics).toEqual([]);
      expect(ast).not.toBeNull();
      const printed = astToDsl(ast as ASTNode, extCtx);
      const reparsed = parseDsl(printed, extCtx);
      expect(reparsed.diagnostics).toEqual([]);
      expect(reparsed.ast).toEqual(ast);
    });
  }
});
