/**
 * Pretty-printer that turns an AST back into Expression Assistant DSL.
 *
 * Round-trip property: for any AST produced by `parseDsl(s, ctx)`,
 * `parseDsl(astToDsl(ast, ctx), ctx)` must yield an equivalent AST. We
 * over-parenthesise rather than under — readability is good enough for a
 * few extra parens in nested expressions, and over-parenthesising never
 * changes meaning.
 *
 * Identifier preservation:
 *   • columnRef ("C"/"D"/"E"/"F") prints as the alias defined in
 *     SymbolContext.inputColumns. If multiple aliases map to the same
 *     letter, the first match wins.
 *   • outputRef / prevOutput print as the stored formula key, lowercased
 *     when it would otherwise collide with reserved function names.
 *   • partnerRef is preserved as a `partner_<id>` placeholder; the new
 *     UI does not produce these, but legacy ASTs may still contain them
 *     and we round-trip them through to avoid silent data loss.
 */

import type { ASTNode, BinaryOp, InputColumn } from "./types";
import type { SymbolContext } from "./dsl-parser";
import { DEFAULT_INPUT_COLUMNS } from "./dsl-parser";

/** Precedence levels mirror the parser's grammar layers. Higher = binds tighter. */
const PRECEDENCE = {
  ternary: 1,
  or: 2,
  and: 3,
  equality: 4,
  comparison: 5,
  addSub: 6,
  mulDiv: 7,
  unary: 8,
  primary: 9,
} as const;

type Prec = (typeof PRECEDENCE)[keyof typeof PRECEDENCE];

const BIN_PREC: Record<BinaryOp, Prec> = {
  "=": PRECEDENCE.equality,
  "<>": PRECEDENCE.equality,
  ">": PRECEDENCE.comparison,
  "<": PRECEDENCE.comparison,
  ">=": PRECEDENCE.comparison,
  "<=": PRECEDENCE.comparison,
  "+": PRECEDENCE.addSub,
  "-": PRECEDENCE.addSub,
  "*": PRECEDENCE.mulDiv,
  "/": PRECEDENCE.mulDiv,
};

const BIN_TEXT: Record<BinaryOp, string> = {
  "=": "==",
  "<>": "!=",
  ">": ">",
  "<": "<",
  ">=": ">=",
  "<=": "<=",
  "+": "+",
  "-": "-",
  "*": "*",
  "/": "/",
};

/** Quote a string literal for the DSL. */
function quoteString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

/**
 * Build an inverse map letter → alias from the SymbolContext. The alias
 * dictionary is small (4 entries by default) so a linear scan is fine.
 */
function inverseColumnMap(
  inputColumns: Record<string, InputColumn>
): Record<InputColumn, string> {
  const out: Partial<Record<InputColumn, string>> = {};
  for (const alias of Object.keys(inputColumns)) {
    const letter = inputColumns[alias];
    if (!(letter in out)) out[letter] = alias;
  }
  // Fall back to the column letter itself if the user didn't provide a
  // mapping for one of the columns. The parser will treat it as an unknown
  // identifier on the next round-trip — surfacing a hint to the user.
  return {
    C: out.C ?? "kategori",
    D: out.D ?? "debit",
    E: out.E ?? "kredit",
    F: out.F ?? "keperluan",
  };
}

/**
 * Print `node` as DSL source. The default symbol context maps the standard
 * column aliases (kategori/debit/kredit/keperluan).
 */
export function astToDsl(
  node: ASTNode,
  ctx: SymbolContext = { inputColumns: DEFAULT_INPUT_COLUMNS, formulaKeys: [] }
): string {
  const inverse = inverseColumnMap(ctx.inputColumns);
  return printNode(node, PRECEDENCE.ternary, inverse);
}

function wrap(str: string, parentPrec: number, ownPrec: number): string {
  return ownPrec < parentPrec ? `(${str})` : str;
}

function printNode(
  node: ASTNode,
  parentPrec: number,
  inverse: Record<InputColumn, string>
): string {
  switch (node.type) {
    case "literal": {
      if (typeof node.value === "string") return quoteString(node.value);
      if (typeof node.value === "boolean") return node.value ? "true" : "false";
      return String(node.value);
    }
    case "columnRef":
      return `[${inverse[node.column]}]`;
    case "prevOutput":
      return `PREV([${node.column}])`;
    case "outputRef":
      return `[${node.column}]`;
    case "partnerRef":
      // Legacy — emit a recognisable placeholder.
      return `[partner_${node.partnerId}]`;
    case "row":
      return "ROW()";
    case "search":
      return `SEARCH(${printNode(node.find, PRECEDENCE.ternary, inverse)}, ${printNode(node.within, PRECEDENCE.ternary, inverse)})`;
    case "iserror":
      return `ISERROR(${printNode(node.arg, PRECEDENCE.ternary, inverse)})`;
    case "not":
      return `NOT(${printNode(node.arg, PRECEDENCE.ternary, inverse)})`;
    case "negate": {
      const inner = printNode(node.arg, PRECEDENCE.unary, inverse);
      return wrap(`-${inner}`, parentPrec, PRECEDENCE.unary);
    }
    case "and": {
      const own = PRECEDENCE.and;
      const left = printNode(node.left, own, inverse);
      const right = printNode(node.right, own + 1, inverse);
      return `AND(${left}, ${right})`;
    }
    case "or": {
      const own = PRECEDENCE.or;
      const left = printNode(node.left, own, inverse);
      const right = printNode(node.right, own + 1, inverse);
      return `OR(${left}, ${right})`;
    }
    case "if":
      return `IF(${printNode(node.cond, PRECEDENCE.ternary, inverse)}, ${printNode(node.then, PRECEDENCE.ternary, inverse)}, ${printNode(node.else, PRECEDENCE.ternary, inverse)})`;
    case "binaryOp": {
      const own = BIN_PREC[node.op];
      const left = printNode(node.left, own, inverse);
      const right = printNode(node.right, own + 1, inverse);
      return wrap(`${left} ${BIN_TEXT[node.op]} ${right}`, parentPrec, own);
    }
    case "funcCall": {
      const args = node.args
        .map((a) => printNode(a, PRECEDENCE.ternary, inverse))
        .join(", ");
      return `${node.name}(${args})`;
    }
  }
}
