import { validateAST } from "../validate";
import { DEFAULT_FORMULAS } from "../defaults";

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
