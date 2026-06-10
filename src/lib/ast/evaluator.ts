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
  type Value,
  FormulaEvalError,
  SearchNotFoundError,
} from "./types";
import { FUNCTION_BY_NAME, AGGREGATION_FUNCTIONS } from "./function-library";

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
  /**
   * Pre-computed aggregation results keyed by `aggregateKey(funcCall)`.
   * Populated by `evaluateDataset` before per-row evaluation; absent for
   * ad-hoc single-node evaluation, in which case aggregation calls
   * resolve to 0.
   */
  aggregates?: Record<string, Value>;
  /**
   * Map of formula_group → list of formula keys (column ids) belonging to
   * that group. Used by SUM_GROUP() to aggregate values from sibling
   * formulas in the same group. Empty when not provided (ad-hoc eval).
   */
  groupKeys?: Record<string, string[]>;
}

/** AST runtime value — re-exported here for callers that historically imported it. */
export type { Value } from "./types";

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

    case "funcCall": {
      const def = FUNCTION_BY_NAME[node.name];
      if (!def) {
        throw new FormulaEvalError(`Fungsi tidak dikenal: ${node.name}`);
      }
      // Aggregation functions are pre-computed by the dataset evaluator and
      // stored in ctx.aggregates. Per-row evaluation just looks up the result.
      if (AGGREGATION_FUNCTIONS.has(node.name)) {
        const aggs = ctx.aggregates ?? {};
        const key = aggregateKey(node);
        if (key in aggs) return aggs[key];
        // Fallback when aggregation pass didn't run (e.g. ad-hoc evaluate).
        return 0;
      }
      const args = node.args.map((a) => evaluate(a, ctx));
      // Functions that need access to other formula values (mainly
      // SUM_GROUP) use evaluateWithContext instead of plain evaluate.
      if (def.evaluateWithContext) {
        return def.evaluateWithContext(args, {
          currentOutputs: ctx.currentOutputs,
          groupKeys: ctx.groupKeys ?? {},
        });
      }
      if (!def.evaluate) {
        throw new FormulaEvalError(`Fungsi ${node.name} belum punya implementasi.`);
      }
      return def.evaluate(args);
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
  // funcCall stores its children in `args` rather than the standard slots.
  if (node.type === "funcCall") {
    for (const a of node.args) collectDependencies(a, out);
  }
  return out;
}

/**
 * Topologically order formulas so each formula runs AFTER any formula whose
 * output column it references via `outputRef`. Cycles are tolerated: cyclic
 * formulas keep their original relative order and read 0 for cycle members.
 */
export function sortFormulasByDependency<
  T extends { column: string; ast: ASTNode; formulaKey?: string; dbColumn?: string | null }
>(formulas: T[]): T[] {
  // Indeks formula dengan huruf kolom DAN semantic key (formulaKey / dbColumn).
  // Formula actor (bagi hasil/kasbon/bonus) merujuk formula lain via
  // outputRef("laba_bersih") — sebuah formulaKey, bukan huruf kolom — jadi
  // pemetaan dependensi harus mengenali kedua bentuk, kalau tidak laba tidak
  // terurut sebelum bagi hasil dan bagi hasil membaca 0.
  const byColumn = new Map<string, T>();
  for (const f of formulas) {
    byColumn.set(f.column, f);
    if (f.formulaKey && !byColumn.has(f.formulaKey)) byColumn.set(f.formulaKey, f);
    if (f.dbColumn && !byColumn.has(f.dbColumn)) byColumn.set(f.dbColumn, f);
  }

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
 * Build a stable key for an aggregation funcCall so the dataset evaluator
 * can cache the result. The key combines the function name with each
 * argument's structural shape (column letter, formula key, or literal
 * value) — enough to identify two calls as equivalent.
 */
function aggregateKey(node: ASTNode & { type: "funcCall" }): string {
  return `${node.name}(${node.args.map(argSig).join(",")})`;
}

function argSig(n: ASTNode): string {
  switch (n.type) {
    case "literal":
      return JSON.stringify(n.value);
    case "columnRef":
      return `C:${n.column}`;
    case "outputRef":
      return `O:${n.column}`;
    case "prevOutput":
      return `P:${n.column}`;
    default:
      return JSON.stringify(n);
  }
}

/**
 * Walk an AST and collect every aggregation funcCall it depends on.
 * Aggregations are evaluated once per dataset, before per-row evaluation.
 */
function collectAggregations(
  node: ASTNode,
  out: Map<string, ASTNode & { type: "funcCall" }> = new Map()
): Map<string, ASTNode & { type: "funcCall" }> {
  if (node.type === "funcCall" && AGGREGATION_FUNCTIONS.has(node.name)) {
    out.set(aggregateKey(node), node);
  }
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
      collectAggregations(v as ASTNode, out);
    }
  }
  if (node.type === "funcCall") {
    for (const a of node.args) collectAggregations(a, out);
  }
  return out;
}

/** Resolve an aggregation argument to a concrete value-getter for a row. */
function readAggArg(
  n: ASTNode,
  row: InputRow,
  computedRow: OutputRow
): number | string {
  if (n.type === "literal") {
    return typeof n.value === "boolean" ? (n.value ? 1 : 0) : n.value;
  }
  if (n.type === "columnRef") {
    const v = row[n.column];
    return v ?? (n.column === "C" || n.column === "F" ? "" : 0);
  }
  if (n.type === "outputRef") {
    const v = computedRow[n.column];
    return typeof v === "boolean" ? (v ? 1 : 0) : v ?? 0;
  }
  return 0;
}

function asNumber(v: number | string): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute one aggregation across all rows. Aggregations may reference
 * `outputRef` of other formulas; for those we use the second-pass
 * computed values from the previous run (best-effort — see notes in
 * `evaluateDataset`). Input columns are read directly from the dataset.
 */
function computeAggregation(
  node: ASTNode & { type: "funcCall" },
  rows: InputRow[],
  computedRows: OutputRow[]
): Value {
  switch (node.name) {
    case "SUM": {
      let total = 0;
      for (let i = 0; i < rows.length; i += 1) {
        total += asNumber(readAggArg(node.args[0], rows[i], computedRows[i] ?? {}));
      }
      return total;
    }
    case "AVERAGE": {
      let total = 0;
      let n = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const v = readAggArg(node.args[0], rows[i], computedRows[i] ?? {});
        if (typeof v === "number" && Number.isFinite(v)) {
          total += v;
          n += 1;
        }
      }
      return n === 0 ? 0 : total / n;
    }
    case "COUNT": {
      let n = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const v = readAggArg(node.args[0], rows[i], computedRows[i] ?? {});
        if (typeof v === "number" && v !== 0) n += 1;
      }
      return n;
    }
    case "SUMIF": {
      // SUMIF(condCol, target, sumCol)
      const targetVal = node.args[1].type === "literal" ? node.args[1].value : "";
      const target = String(targetVal).toUpperCase();
      let total = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const cond = String(readAggArg(node.args[0], rows[i], computedRows[i] ?? "")).toUpperCase();
        if (cond === target) {
          total += asNumber(readAggArg(node.args[2], rows[i], computedRows[i] ?? {}));
        }
      }
      return total;
    }
    case "COUNTIF": {
      const targetVal = node.args[1].type === "literal" ? node.args[1].value : "";
      const target = String(targetVal).toUpperCase();
      let n = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const cond = String(readAggArg(node.args[0], rows[i], computedRows[i] ?? "")).toUpperCase();
        if (cond === target) n += 1;
      }
      return n;
    }
    case "AVERAGEIF": {
      const targetVal = node.args[1].type === "literal" ? node.args[1].value : "";
      const target = String(targetVal).toUpperCase();
      let total = 0;
      let n = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const cond = String(readAggArg(node.args[0], rows[i], computedRows[i] ?? "")).toUpperCase();
        if (cond === target) {
          total += asNumber(readAggArg(node.args[2], rows[i], computedRows[i] ?? {}));
          n += 1;
        }
      }
      return n === 0 ? 0 : total / n;
    }
  }
  return 0;
}

/**
 * Evaluate every formula across the dataset, row by row. The returned array
 * matches the input rows 1:1.
 *
 * `formulas` may include an optional `formulaGroup` field per entry; when
 * provided, SUM_GROUP() can sum sibling formula values from the same group
 * within each row.
 */
export function evaluateDataset(
  rows: InputRow[],
  formulas: Array<{
    column: string;
    ast: ASTNode;
    formulaGroup?: string;
    formulaKey?: string;
    dbColumn?: string | null;
  }>,
  partners: PartnerDefinition[] = []
): OutputRow[] {
  const ordered = sortFormulasByDependency(formulas);
  const partnerMap: Record<string, PartnerDefinition> = {};
  for (const p of partners) partnerMap[p.id] = p;

  // Build groupKeys map: formula_group → list of column ids in that group.
  // Consumed by SUM_GROUP() during per-row evaluation.
  const groupKeys: Record<string, string[]> = {};
  for (const f of formulas) {
    const g = f.formulaGroup;
    if (!g) continue;
    if (!groupKeys[g]) groupKeys[g] = [];
    groupKeys[g].push(f.column);
  }

  // Pass 1: discover every aggregation funcCall referenced by any formula.
  const aggs = new Map<string, ASTNode & { type: "funcCall" }>();
  for (const f of ordered) collectAggregations(f.ast, aggs);

  // Pass 2: pre-compute aggregations against the input columns.
  const aggregates: Record<string, Value> = {};
  for (const [key, node] of aggs) {
    aggregates[key] = computeAggregation(node, rows, []);
  }

  // Pass 3: per-row evaluation with aggregation results in context.
  const out: OutputRow[] = [];
  let prevOutputs: OutputRow = {};

  for (let i = 0; i < rows.length; i += 1) {
    const input = rows[i];
    const currentOutputs: OutputRow = {};
    const rowNum = i + 2;

    for (const formula of ordered) {
      let value: Value;
      try {
        value = evaluate(formula.ast, {
          row: rowNum,
          input,
          prevOutputs,
          currentOutputs,
          partners: partnerMap,
          aggregates,
          groupKeys,
        });
      } catch (e) {
        if (
          e instanceof SearchNotFoundError ||
          e instanceof FormulaEvalError
        ) {
          value = 0;
        } else {
          throw e;
        }
      }
      currentOutputs[formula.column] = value;
      // Indeks juga dengan semantic key (formulaKey / dbColumn) supaya formula
      // lain di baris yang sama bisa membaca lewat outputRef("laba_bersih"),
      // bukan cuma huruf kolom. Tanpa ini formula actor (bagi hasil/kasbon/
      // bonus) yang merujuk formula sistem selalu membaca 0.
      const fKey = formula.formulaKey || formula.dbColumn || undefined;
      if (fKey && fKey !== formula.column) currentOutputs[fKey] = value;
    }

    out.push(currentOutputs);
    prevOutputs = currentOutputs;
  }

  return out;
}
