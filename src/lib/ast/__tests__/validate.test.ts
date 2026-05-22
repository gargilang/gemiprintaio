import { validateAST } from "../validate";
import { DEFAULT_FORMULAS } from "../defaults";
import type { ASTNode } from "../types";

describe("validateAST", () => {
  test("default formulas are structurally valid", () => {
    for (const f of DEFAULT_FORMULAS) {
      expect(validateAST(f.ast)).toEqual([]);
    }
  });

  test("flags unknown node types", () => {
    const issues = validateAST({ type: "bogus" } as unknown);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].code).toBe("unknown_type");
  });

  test("flags bad column letters", () => {
    const issues = validateAST({
      type: "columnRef",
      column: "Z",
    } as unknown);
    expect(issues.some((i) => i.code === "bad_column")).toBe(true);
  });

  test("flags binaryOp without operator", () => {
    const issues = validateAST({
      type: "binaryOp",
      left: { type: "literal", value: 1 },
      right: { type: "literal", value: 2 },
    } as unknown);
    expect(issues.some((i) => i.code === "bad_op")).toBe(true);
  });
});

describe("validateAST with symbol context", () => {
  const ctx = { formulaKeys: ["omzet", "saldo", "laba_bersih"] };

  test("known outputRef passes", () => {
    const ast: ASTNode = { type: "outputRef", column: "omzet" };
    expect(validateAST(ast, ctx)).toEqual([]);
  });

  test("unknown outputRef flagged with did-you-mean", () => {
    const ast: ASTNode = { type: "outputRef", column: "omzed" };
    const issues = validateAST(ast, ctx);
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe("unknown_output_column");
    expect(issues[0].hint).toBe('Maksudnya "omzet"?');
  });

  test("legacy 3-arg form still works", () => {
    const ast: ASTNode = { type: "outputRef", column: "X" };
    const issues = validateAST(ast, ["omzet", "saldo"]);
    expect(issues.some((i) => i.code === "unknown_output_column")).toBe(true);
  });

  test("case-insensitive matching", () => {
    const ast: ASTNode = { type: "outputRef", column: "Omzet" };
    expect(validateAST(ast, ctx)).toEqual([]);
  });
});
