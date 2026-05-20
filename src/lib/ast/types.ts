/**
 * AST (Abstract Syntax Tree) types for the visual finance formula builder.
 *
 * Each formula is a tree of ASTNode values. The evaluator in `evaluator.ts`
 * walks the tree against a runtime context (current row + previous row's
 * outputs + already-computed outputs of the current row).
 *
 * The set of node types is intentionally small so that the visual editor
 * (React Flow) can have a 1:1 mapping between node kinds and palette items.
 */

/** Comparison + arithmetic operators allowed in `binaryOp`. */
export type BinaryOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | "="
  | "<>"
  | ">"
  | "<"
  | ">="
  | "<=";

/** Input transaction columns referenced by formulas. */
export type InputColumn = "C" | "D" | "E" | "F";

/**
 * One node of a formula tree. All sub-expressions are AST nodes themselves,
 * which keeps the structure uniform for the visual editor.
 */
export type ASTNode =
  | { type: "literal"; value: string | number | boolean }
  | { type: "columnRef"; column: InputColumn }
  | { type: "prevOutput"; column: string }
  | { type: "outputRef"; column: string }
  | { type: "partnerRef"; partnerId: string }
  | { type: "row" }
  | { type: "search"; find: ASTNode; within: ASTNode }
  | { type: "iserror"; arg: ASTNode }
  | { type: "not"; arg: ASTNode }
  | { type: "negate"; arg: ASTNode }
  | { type: "and"; left: ASTNode; right: ASTNode }
  | { type: "or"; left: ASTNode; right: ASTNode }
  | { type: "if"; cond: ASTNode; then: ASTNode; else: ASTNode }
  | { type: "binaryOp"; op: BinaryOp; left: ASTNode; right: ASTNode };

/** Logical column key produced by a formula (G, H, I, ...). */
export type OutputColumn = string;

/** Persisted formula definition. */
export interface FormulaDefinition {
  id: string;
  name: string;
  /** Logical output column (e.g. "G") + DB column it maps to (e.g. "omzet"). */
  column: OutputColumn;
  /** keuangan DB column to write into; may equal column for technical setups. */
  dbColumn: string;
  ast: ASTNode;
  enabled: boolean;
  isSystem: boolean;
  displayOrder: number;
  description?: string | null;
}

/** Persisted partner record. */
export interface PartnerDefinition {
  id: string;
  name: string;
  /** Optional category code linked to this partner (e.g. "PRIBADI-S"). */
  category?: string | null;
  displayOrder: number;
}

/** One transaction row as fed into the engine. */
export interface InputRow {
  C: string;
  D: number;
  E: number;
  F: string;
}

/** Map of computed values keyed by logical output column (G, H, ...). */
export type OutputRow = Record<OutputColumn, number | string | boolean>;

/** Error thrown by SEARCH when the needle is not present in the haystack. */
export class SearchNotFoundError extends Error {
  constructor(find: string, within: string) {
    super(`SEARCH did not find "${find}" in "${within}"`);
    this.name = "SearchNotFoundError";
  }
}

/** Public AST-level error so callers can show a friendly message. */
export class FormulaEvalError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "FormulaEvalError";
  }
}
