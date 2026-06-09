/**
 * AST normalisation utilities.
 *
 * Some legacy formulas store spreadsheet letters ("G", "H", ...) in
 * `prevOutput.column` and `outputRef.column` instead of semantic
 * formula keys ("omzet", "saldo"). The Expression Assistant DSL only
 * speaks formula keys, so we normalise legacy ASTs through these
 * helpers before printing or persisting.
 *
 * The mapping is driven by the live `rumus_buku_kas` table — the
 * caller passes in `letterToKey` derived from `column_key → formula_key`.
 * Unknown letters are left alone so we can surface them as diagnostics
 * rather than silently rewriting them.
 */

import type { ASTNode } from "./types";

/**
 * Build a letter→formula_key map from a list of formula definitions.
 *
 * Definitions may use either the legacy `column` letter or the
 * semantic `formulaKey`. Both are accepted as keys so the resulting
 * map is robust to half-migrated data.
 */
export function buildLetterToKeyMap(
  formulas: Array<{ column?: string; formulaKey?: string | null; dbColumn?: string | null }>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of formulas) {
    const key = f.formulaKey || f.dbColumn || f.column;
    if (!key) continue;
    if (f.column && f.column !== key) {
      out[f.column] = key;
    }
    // Self-mapping so callers don't need to special-case rewritten ASTs.
    out[key] = key;
  }
  return out;
}

/**
 * Walk the AST and rewrite any `prevOutput`/`outputRef` column whose
 * value matches a legacy letter into the corresponding semantic key.
 *
 * This is a structural rewrite — node identity is not preserved, but
 * the rest of the tree is cloned shallowly which is sufficient for
 * downstream printing/parsing.
 */
export function normalizeAstColumns(
  ast: ASTNode,
  letterToKey: Record<string, string>
): ASTNode {
  function walk(n: ASTNode): ASTNode {
    switch (n.type) {
      case "prevOutput": {
        const mapped = letterToKey[n.column];
        if (!mapped || mapped === n.column) return n;
        return { type: "prevOutput", column: mapped };
      }
      case "outputRef": {
        const mapped = letterToKey[n.column];
        if (!mapped || mapped === n.column) return n;
        return { type: "outputRef", column: mapped };
      }
      case "search":
        return {
          type: "search",
          find: walk(n.find),
          within: walk(n.within),
        };
      case "iserror":
        return { type: "iserror", arg: walk(n.arg) };
      case "not":
        return { type: "not", arg: walk(n.arg) };
      case "negate":
        return { type: "negate", arg: walk(n.arg) };
      case "and":
        return { type: "and", left: walk(n.left), right: walk(n.right) };
      case "or":
        return { type: "or", left: walk(n.left), right: walk(n.right) };
      case "if":
        return {
          type: "if",
          cond: walk(n.cond),
          then: walk(n.then),
          else: walk(n.else),
        };
      case "binaryOp":
        return {
          type: "binaryOp",
          op: n.op,
          left: walk(n.left),
          right: walk(n.right),
        };
      case "funcCall":
        return {
          type: "funcCall",
          name: n.name,
          args: n.args.map(walk),
        };
      default:
        return n;
    }
  }
  return walk(ast);
}
