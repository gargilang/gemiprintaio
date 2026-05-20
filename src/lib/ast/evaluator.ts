/**
 * Pure tree-walking evaluator for the cashbook formula AST.
 *
 * Conventions (matched against the original Google Sheets formulas):
 *   • `IF` treats 0, false, "" as falsy. Anything else is truthy.
 *   • `SEARCH` does a case-insensitive substring search. If the needle is not
 *     present it throws a SearchNotFoundError, which `ISERROR` catches.
 *   • `ROW()` returns the 1-based spreadsheet row index. Row 2 is the first
 *     data row (matching the source spreadsheet, where row 1 is the header).
 *   • `prevOutput` references the previous row's value of the same logical
 *     output column. The first data row sees `0` for any prevOutput.
 *   • `outputRef` references another formula's already-computed value for the
 *     CURRENT row. Formulas must be ordered so dependencies come first
 *     (see `sortFormulasByDependency`).
 *   • Unknown variables (missing partner, missing previous row) resolve to
 *     numeric 0 or empty string "" depending on context.
 */

import {
  type ASTNode,
  type InputRow,
  type OutputRow,
  type PartnerDefinition,
  FormulaEvalError,
  SearchNotFoundError,
} from "./types";

/**
 * Runtime context passed to the evaluator.
 *
 * @property row              1-based spreadsheet row index (row 2 == first data row).
 * @property input            Current input row (columns C, D, E, F).
 * @property prevOutputs      Previous row's outputs (empty object on row 2).
 * @property currentOutputs   Already-computed outputs of the current row.
 * @property partners         Partner lookup keyed by id.
 */
export interface EvalContext {
  row: number;
  input: InputRow;
  prevOutputs: OutputRow;
  currentOutputs: OutputRow;
  partners: Record<string, PartnerDefinition>;
}

/** AST runtime value — same union as a JavaScript primitive. */
export type Value = number | string | boolean;

/** Spreadsheet-style truthiness: 0, false, "" are falsy. */
function isTruthy(v: Value): boolean {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return Boolean(v);
}

function toNumber(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toString(v: Value): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return v ? "TRUE" : "FALSE";
}

/** Spreadsheet equality: numeric vs numeric, string vs string (case-insensitive). */
function eq(a: Value, b: Value): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return toNumber(a) === toNumber(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b);
  }
  return toString(a).toUpperCase() === toString(b).toUpperCase();
}

/** Compare numerically; strings are converted with toNumber (falling back to 0). */
function cmp(a: Value, b: Value): number {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (na < nb) return -1;
  if (na > nb) return 1;
  return 0;
}

/**
 * Evaluate a single AST node against the given context.
 *
 * @throws SearchNotFoundError when SEARCH cannot find the needle (caught by ISERROR).
 * @throws FormulaEvalError on structural / type errors.
 */
export function evaluate(node: ASTNode, ctx: EvalContext): Value {
  switch (node.type) {
    case "literal":
      return node.value;

    case "row":
      return ctx.row;

    case "columnRef": {
      const v = ctx.input[node.column];
      if (v === undefined || v === null) {
        return node.column === "C" || node.column === "F" ? "" : 0;
      }
      return v;
    }

    case "prevOutput": {
      const v = ctx.prevOutputs[node.column];
      return v === undefined || v === null ? 0 : v;
    }

    case "outputRef": {
      const v = ctx.currentOutputs[node.column];
      if (v === undefined || v === null) {
        // Forward-referenced column — treat as 0 instead of crashing the row.
        return 0;
      }
      return v;
    }

    case "partnerRef": {
      const p = ctx.partners[node.partnerId];
      // Returning the partner's name allows SEARCH / comparisons to work the
      // same way they did with hardcoded literals.
      return p ? p.name : "";
    }

    case "search": {
      const find = toString(evaluate(node.find, ctx));
      const within = toString(evaluate(node.within, ctx));
      if (!find) {
        // SEARCH on empty needle is undefined behaviour in Sheets; treat as
        // "not found" so callers wrap it in ISERROR.
        throw new SearchNotFoundError(find, within);
      }
      const idx = within.toLowerCase().indexOf(find.toLowerCase());
      if (idx < 0) throw new SearchNotFoundError(find, within);
      return idx + 1;
    }

    case "iserror": {
      try {
        evaluate(node.arg, ctx);
        return false;
      } catch (e) {
        // Only catch evaluator errors — bubble unexpected JS errors.
        if (
          e instanceof SearchNotFoundError ||
          e instanceof FormulaEvalError
        ) {
          return true;
        }
        throw e;
      }
    }

    case "not":
      return !isTruthy(evaluate(node.arg, ctx));

    case "negate":
      return -toNumber(evaluate(node.arg, ctx));

    case "and":
      return (
        isTruthy(evaluate(node.left, ctx)) &&
        isTruthy(evaluate(node.right, ctx))
      );

    case "or":
      return (
        isTruthy(evaluate(node.left, ctx)) ||
        isTruthy(evaluate(node.right, ctx))
      );

    case "if": {
      const condVal = evaluate(node.cond, ctx);
      return isTruthy(condVal)
        ? evaluate(node.then, ctx)
        : evaluate(node.else, ctx);
    }

    case "binaryOp": {
      const l = evaluate(node.left, ctx);
      const r = evaluate(node.right, ctx);
      switch (node.op) {
        case "+":
          return toNumber(l) + toNumber(r);
        case "-":
          return toNumber(l) - toNumber(r);
        case "*":
          return toNumber(l) * toNumber(r);
        case "/": {
          const denom = toNumber(r);
          if (denom === 0) return 0;
          return toNumber(l) / denom;
        }
        case "=":
          return eq(l, r);
        case "<>":
          return !eq(l, r);
        case ">":
          return cmp(l, r) > 0;
        case "<":
          return cmp(l, r) < 0;
        case ">=":
          return cmp(l, r) >= 0;
        case "<=":
          return cmp(l, r) <= 0;
      }
      throw new FormulaEvalError(`Unknown binary operator: ${(node as { op: string }).op}`);
    }
  }

  throw new FormulaEvalError(
    `Unknown AST node type: ${(node as { type: string }).type}`
  );
}

/**
 * Collect every output column an AST depends on.
 *
 * Used by `sortFormulasByDependency` to figure out evaluation order for the
 * CURRENT row. `prevOutput` is intentionally NOT included because it always
 * resolves against the previous row's snapshot, which is already complete.
 */
export function collectDependencies(node: ASTNode, out = new Set<string>()): Set<string> {
  if (node.type === "outputRef") out.add(node.column);

  // Walk every child node generically — keeps dependency collection in sync
  // with new AST node types without per-type handlers.
  const childKeys: (keyof typeof node)[] = [
    "arg" as keyof typeof node,
    "left" as keyof typeof node,
    "right" as keyof typeof node,
    "cond" as keyof typeof node,
    "then" as keyof typeof node,
    "else" as keyof typeof node,
    "find" as keyof typeof node,
    "within" as keyof typeof node,
  ];
  for (const k of childKeys) {
    const v = (node as Record<string, unknown>)[k as string];
    if (v && typeof v === "object" && "type" in (v as Record<string, unknown>)) {
      collectDependencies(v as ASTNode, out);
    }
  }
  return out;
}

/**
 * Topologically order formulas so each formula runs AFTER any formula whose
 * output column it references via `outputRef`. Cycles are tolerated: cyclic
 * formulas keep their original relative order and read 0 for cycle members.
 */
export function sortFormulasByDependency<
  T extends { column: string; ast: ASTNode }
>(formulas: T[]): T[] {
  const byColumn = new Map<string, T>();
  for (const f of formulas) byColumn.set(f.column, f);

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: T[] = [];

  function visit(f: T) {
    if (visited.has(f.column)) return;
    if (visiting.has(f.column)) return;
    visiting.add(f.column);
    const deps = collectDependencies(f.ast);
    for (const dep of deps) {
      const depFormula = byColumn.get(dep);
      if (depFormula && depFormula !== f) visit(depFormula);
    }
    visiting.delete(f.column);
    visited.add(f.column);
    ordered.push(f);
  }

  for (const f of formulas) visit(f);
  return ordered;
}

/**
 * Evaluate every formula across the dataset, row by row. The returned array
 * matches the input rows 1:1.
 */
export function evaluateDataset(
  rows: InputRow[],
  formulas: Array<{ column: string; ast: ASTNode }>,
  partners: PartnerDefinition[] = []
): OutputRow[] {
  const ordered = sortFormulasByDependency(formulas);
  const partnerMap: Record<string, PartnerDefinition> = {};
  for (const p of partners) partnerMap[p.id] = p;

  const out: OutputRow[] = [];
  let prevOutputs: OutputRow = {};

  for (let i = 0; i < rows.length; i++) {
    const input = rows[i];
    const currentOutputs: OutputRow = {};
    // Spreadsheet rows start at 2 because row 1 is the header.
    const rowNum = i + 2;

    for (const formula of ordered) {
      try {
        const value = evaluate(formula.ast, {
          row: rowNum,
          input,
          prevOutputs,
          currentOutputs,
          partners: partnerMap,
        });
        currentOutputs[formula.column] = value;
      } catch (e) {
        if (
          e instanceof SearchNotFoundError ||
          e instanceof FormulaEvalError
        ) {
          currentOutputs[formula.column] = 0;
        } else {
          throw e;
        }
      }
    }

    out.push(currentOutputs);
    prevOutputs = currentOutputs;
  }

  return out;
}
