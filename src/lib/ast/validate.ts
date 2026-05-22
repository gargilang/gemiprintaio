/**
 * Structural validation for AST nodes.
 *
 * Two call patterns are supported:
 *
 *   • `validateAST(node)`                — pure structural check; flags
 *                                          unknown node types, missing
 *                                          fields, bad operators.
 *   • `validateAST(node, ctx)`           — additionally checks every
 *                                          identifier against the
 *                                          symbol table from the live
 *                                          formula schema and adds
 *                                          did-you-mean hints.
 *
 * The legacy 3-argument form `validateAST(node, knownColumns, knownPartners)`
 * stays supported for backward compatibility — it builds a context with
 * those values plus default input columns.
 */

import type { ASTNode } from "./types";
import { DEFAULT_INPUT_COLUMNS } from "./dsl-parser";

export interface ValidationIssue {
  /** Stable code for testing / i18n. */
  code: string;
  /** Indonesian human-readable message shown to the user. */
  message: string;
  /** Path of node types from the root to the offending node, for debugging. */
  path: string[];
  /** Optional did-you-mean suggestion. */
  hint?: string;
}

/** Symbol table consumed by the validator. */
export interface ValidateContext {
  /** Aliases recognised in `columnRef` (defaults to kategori/debit/kredit/keperluan). */
  inputColumns?: Record<string, "C" | "D" | "E" | "F">;
  /** Valid `formula_key` values for `outputRef` / `prevOutput`. */
  formulaKeys?: string[];
  /** Optional list of valid partner ids (legacy). */
  partnerIds?: string[];
}

const BINARY_OPS = new Set([
  "+",
  "-",
  "*",
  "/",
  "=",
  "<>",
  ">",
  "<",
  ">=",
  "<=",
]);

const KNOWN_NODE_TYPES = new Set([
  "literal",
  "columnRef",
  "prevOutput",
  "outputRef",
  "partnerRef",
  "row",
  "search",
  "iserror",
  "not",
  "negate",
  "and",
  "or",
  "if",
  "binaryOp",
  "funcCall",
]);

/**
 * Levenshtein for did-you-mean suggestions. Small symbol tables only;
 * O(len(a) × len(b)) is fine for <200 entries.
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j += 1) dp[j] = j;
  for (let i = 1; i <= al; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j += 1) {
      const tmp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j], dp[j - 1]);
      }
      prev = tmp;
    }
  }
  return dp[bl];
}

function nearest(candidate: string, known: string[]): string | null {
  let best: { name: string; d: number } | null = null;
  const lower = candidate.toLowerCase();
  for (const k of known) {
    const d = distance(lower, k.toLowerCase());
    if (best === null || d < best.d) best = { name: k, d };
  }
  if (best && best.d <= Math.max(2, Math.floor(candidate.length / 3))) {
    return best.name;
  }
  return null;
}

/**
 * Walk the AST and accumulate every structural / symbol problem.
 *
 * Callers may pass either a `ValidateContext` (preferred) or the legacy
 * `(knownColumns: string[], knownPartners: string[])` pair. Empty array
 * means the formula is valid.
 */
export function validateAST(
  node: unknown,
  ctxOrColumns: ValidateContext | string[] = {},
  legacyPartners: string[] = []
): ValidationIssue[] {
  const ctx: ValidateContext = Array.isArray(ctxOrColumns)
    ? { formulaKeys: ctxOrColumns, partnerIds: legacyPartners }
    : ctxOrColumns;
  const issues: ValidationIssue[] = [];
  walk(node, [], issues, ctx);
  return issues;
}

function walk(
  node: unknown,
  path: string[],
  issues: ValidationIssue[],
  ctx: ValidateContext
): void {
  const knownColumns = ctx.formulaKeys ?? [];
  const knownPartners = ctx.partnerIds ?? [];
  const inputColumns = ctx.inputColumns ?? DEFAULT_INPUT_COLUMNS;
  const validInputLetters = new Set(Object.values(inputColumns));

  if (!node || typeof node !== "object") {
    issues.push({
      code: "missing_node",
      message: "Ada simpul yang belum diisi.",
      path,
    });
    return;
  }

  const n = node as Record<string, unknown>;
  const t = typeof n.type === "string" ? (n.type as string) : "?";
  const nextPath = [...path, t];

  if (!KNOWN_NODE_TYPES.has(t)) {
    issues.push({
      code: "unknown_type",
      message: `Tipe simpul tidak dikenal: ${t}`,
      path: nextPath,
    });
    return;
  }

  switch (t) {
    case "literal": {
      const v = n.value;
      if (
        typeof v !== "string" &&
        typeof v !== "number" &&
        typeof v !== "boolean"
      ) {
        issues.push({
          code: "literal_value",
          message: "Konstanta harus berupa angka, teks, atau benar/salah.",
          path: nextPath,
        });
      }
      break;
    }
    case "columnRef": {
      const c = n.column;
      if (typeof c !== "string" || !validInputLetters.has(c as "C" | "D" | "E" | "F")) {
        issues.push({
          code: "bad_column",
          message: `Referensi kolom input tidak valid: ${String(c)}`,
          path: nextPath,
        });
      }
      break;
    }
    case "prevOutput":
    case "outputRef": {
      const c = n.column;
      if (typeof c !== "string" || !c) {
        issues.push({
          code: "bad_output_column",
          message: "Referensi kolom hasil belum dipilih.",
          path: nextPath,
        });
      } else if (knownColumns.length > 0 && !knownColumns.some((k) => k.toLowerCase() === c.toLowerCase())) {
        const hint = nearest(c, knownColumns);
        issues.push({
          code: "unknown_output_column",
          message: `Kolom hasil tidak dikenal: ${c}`,
          path: nextPath,
          hint: hint ? `Maksudnya "${hint}"?` : undefined,
        });
      }
      break;
    }
    case "partnerRef": {
      const id = n.partnerId;
      if (typeof id !== "string" || !id) {
        issues.push({
          code: "bad_partner",
          message: "Mitra belum dipilih.",
          path: nextPath,
        });
      } else if (knownPartners.length > 0 && !knownPartners.includes(id)) {
        const hint = nearest(id, knownPartners);
        issues.push({
          code: "unknown_partner",
          message: `Mitra tidak dikenal: ${id}`,
          path: nextPath,
          hint: hint ? `Maksudnya "${hint}"?` : undefined,
        });
      }
      break;
    }
    case "row":
      break;
    case "search":
      walk(n.find, nextPath, issues, ctx);
      walk(n.within, nextPath, issues, ctx);
      break;
    case "iserror":
    case "not":
    case "negate":
      walk(n.arg, nextPath, issues, ctx);
      break;
    case "and":
    case "or":
      walk(n.left, nextPath, issues, ctx);
      walk(n.right, nextPath, issues, ctx);
      break;
    case "if":
      walk(n.cond, nextPath, issues, ctx);
      walk(n.then, nextPath, issues, ctx);
      walk(n.else, nextPath, issues, ctx);
      break;
    case "binaryOp": {
      const opName = n.op;
      if (typeof opName !== "string" || !BINARY_OPS.has(opName)) {
        issues.push({
          code: "bad_op",
          message: "Operator tidak valid.",
          path: nextPath,
        });
      }
      walk(n.left, nextPath, issues, ctx);
      walk(n.right, nextPath, issues, ctx);
      break;
    }
    case "funcCall": {
      if (typeof n.name !== "string" || !n.name) {
        issues.push({
          code: "bad_func_name",
          message: "Nama fungsi belum diisi.",
          path: nextPath,
        });
      }
      const args = Array.isArray(n.args) ? (n.args as unknown[]) : [];
      for (const a of args) walk(a, nextPath, issues, ctx);
      break;
    }
  }
}

/** Re-validate before sending an AST to the engine. Throws on hard errors. */
export function assertValidAST(node: ASTNode): void {
  const issues = validateAST(node);
  if (issues.length > 0) {
    throw new Error(`AST tidak valid: ${issues[0].message}`);
  }
}
