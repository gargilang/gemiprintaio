/**
 * Structural validation for AST nodes.
 *
 * The visual editor calls `validateAST` before saving a formula. Errors are
 * surfaced to the user in Indonesian via the editor; this module only
 * produces machine-readable error codes + messages.
 */

import type { ASTNode } from "./types";

export interface ValidationIssue {
  /** Stable code for testing / i18n. */
  code: string;
  /** Indonesian human-readable message shown to the user. */
  message: string;
  /** Path of node types from the root to the offending node, for debugging. */
  path: string[];
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
]);

/**
 * Walk the AST and accumulate every structural problem. Empty array means
 * the formula is structurally valid (semantic / dependency checks happen
 * elsewhere).
 */
export function validateAST(
  node: unknown,
  knownColumns: string[] = [],
  knownPartners: string[] = []
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  walk(node, [], issues, knownColumns, knownPartners);
  return issues;
}

function walk(
  node: unknown,
  path: string[],
  issues: ValidationIssue[],
  knownColumns: string[],
  knownPartners: string[]
): void {
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
      if (c !== "C" && c !== "D" && c !== "E" && c !== "F") {
        issues.push({
          code: "bad_column",
          message: "Referensi kolom harus salah satu dari C, D, E, atau F.",
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
      } else if (knownColumns.length > 0 && !knownColumns.includes(c)) {
        issues.push({
          code: "unknown_output_column",
          message: `Kolom hasil tidak dikenal: ${c}`,
          path: nextPath,
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
        issues.push({
          code: "unknown_partner",
          message: `Mitra tidak dikenal: ${id}`,
          path: nextPath,
        });
      }
      break;
    }
    case "row":
      break;
    case "search":
      walk(n.find, nextPath, issues, knownColumns, knownPartners);
      walk(n.within, nextPath, issues, knownColumns, knownPartners);
      break;
    case "iserror":
    case "not":
    case "negate":
      walk(n.arg, nextPath, issues, knownColumns, knownPartners);
      break;
    case "and":
    case "or":
      walk(n.left, nextPath, issues, knownColumns, knownPartners);
      walk(n.right, nextPath, issues, knownColumns, knownPartners);
      break;
    case "if":
      walk(n.cond, nextPath, issues, knownColumns, knownPartners);
      walk(n.then, nextPath, issues, knownColumns, knownPartners);
      walk(n.else, nextPath, issues, knownColumns, knownPartners);
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
      walk(n.left, nextPath, issues, knownColumns, knownPartners);
      walk(n.right, nextPath, issues, knownColumns, knownPartners);
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
