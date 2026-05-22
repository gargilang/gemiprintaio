/**
 * AST → Bahasa Indonesia narrative explainer.
 *
 * Walks the AST and emits a single sentence (or paragraph) describing what
 * the formula does in plain Indonesian. The output is meant to read like a
 * verbal explanation a colleague would give — not a literal translation of
 * each operator.
 *
 * Two passes:
 *
 * 1. Pattern recognition for idiomatic shapes that occur in the seeded
 *    formulas (`IF(ROW() == 2, ...)`, `NOT(ISERROR(SEARCH(...)))`). These
 *    produce more natural sentences than the generic walker.
 *
 * 2. Generic node-by-node walk that maps each AST node to a phrase using
 *    the symbol context's labels (e.g. "Debit", "Saldo", "Bagi Hasil Andi").
 *    The result is grammatically correct but more mechanical.
 *
 * The explainer NEVER fails. Unknown nodes fall back to a generic phrase
 * like "ekspresi" so the panel always renders something.
 */

import type { ASTNode, BinaryOp, InputColumn } from "./types";

/** Map of `formula_key` or column alias → human-readable label. */
export interface ExplainContext {
  /**
   * Map of input column letter (C/D/E/F) → user-facing label.
   * Default: { C: "Kategori", D: "Debit", E: "Kredit", F: "Keperluan" }
   */
  columnLabels?: Partial<Record<InputColumn, string>>;
  /**
   * Map of `formula_key` → user-facing label. Falls back to a Title-Cased
   * version of the key (`kasbon_andi` → `Kasbon Andi`) when missing.
   */
  formulaLabels?: Record<string, string>;
}

const DEFAULT_COLUMN_LABELS: Record<InputColumn, string> = {
  C: "Kategori",
  D: "Debit",
  E: "Kredit",
  F: "Keperluan",
};

/**
 * Title-case a snake_case identifier so unmapped keys still look readable.
 *   "kasbon_andi"   → "Kasbon Andi"
 *   "laba_bersih"   → "Laba Bersih"
 */
function titleize(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function formulaLabel(key: string, ctx: ExplainContext): string {
  return ctx.formulaLabels?.[key] ?? titleize(key);
}

function columnLabel(c: InputColumn, ctx: ExplainContext): string {
  return ctx.columnLabels?.[c] ?? DEFAULT_COLUMN_LABELS[c];
}

const BINARY_OP_VERB: Record<BinaryOp, string> = {
  "+": "ditambah",
  "-": "dikurangi",
  "*": "dikali",
  "/": "dibagi",
  "=": "sama dengan",
  "<>": "tidak sama dengan",
  ">": "lebih besar dari",
  "<": "lebih kecil dari",
  ">=": "minimal",
  "<=": "maksimal",
};

// ── Pattern matchers ────────────────────────────────────────────────────────

/** Matches `ROW() == 2`. */
function isFirstRowCheck(node: ASTNode): boolean {
  return (
    node.type === "binaryOp" &&
    node.op === "=" &&
    node.left.type === "row" &&
    node.right.type === "literal" &&
    node.right.value === 2
  );
}

/**
 * Matches `NOT(ISERROR(SEARCH(<find>, <within>)))` which is the spreadsheet
 * idiom for "<within> contains <find>".
 */
function matchContains(
  node: ASTNode
): { needle: ASTNode; haystack: ASTNode } | null {
  if (node.type !== "not") return null;
  if (node.arg.type !== "iserror") return null;
  if (node.arg.arg.type !== "search") return null;
  const search = node.arg.arg;
  return { needle: search.find, haystack: search.within };
}

/** Joins multiple OR'd contains-checks into a comma list. */
function flattenOrContains(
  node: ASTNode
): Array<{ needle: ASTNode; haystack: ASTNode }> | null {
  const out: Array<{ needle: ASTNode; haystack: ASTNode }> = [];
  function walk(n: ASTNode): boolean {
    if (n.type === "or") {
      return walk(n.left) && walk(n.right);
    }
    const m = matchContains(n);
    if (!m) return false;
    out.push(m);
    return true;
  }
  return walk(node) ? out : null;
}

// ── Node → phrase ───────────────────────────────────────────────────────────

/**
 * Render a single node as a phrase. The phrase is a noun-or-clause that fits
 * inside larger sentences without extra glue (e.g. "Debit" or "Saldo dari
 * baris sebelumnya" or "Kategori sama dengan \"OMZET\"").
 */
function explainNode(node: ASTNode, ctx: ExplainContext): string {
  switch (node.type) {
    case "literal": {
      if (typeof node.value === "string") return `"${node.value}"`;
      if (typeof node.value === "boolean") return node.value ? "benar" : "salah";
      // Numbers — render with thousand separators for readability.
      if (Number.isInteger(node.value) && Math.abs(node.value) >= 1000) {
        return node.value.toLocaleString("id-ID");
      }
      return String(node.value);
    }
    case "columnRef":
      return columnLabel(node.column, ctx);
    case "outputRef":
      return formulaLabel(node.column, ctx);
    case "prevOutput":
      return `${formulaLabel(node.column, ctx)} dari baris sebelumnya`;
    case "row":
      return "nomor baris";
    case "partnerRef":
      return `Mitra ${node.partnerId}`;

    case "if": {
      // Idiomatic: IF(ROW() == 2, A, B) → "Pada baris pertama, A. Selain itu, B."
      if (isFirstRowCheck(node.cond)) {
        return `Pada baris pertama, ${explainNode(node.then, ctx)}. Selain itu, ${explainNode(node.else, ctx)}.`;
      }

      // Idiomatic: IF(<contains-or-chain>, A, B) → "Jika <kategori> mengandung X atau Y, maka A. Selain itu, B."
      const orContains = flattenOrContains(node.cond);
      if (orContains && orContains.length > 0) {
        const first = orContains[0];
        const haystackPhrase = explainNode(first.haystack, ctx);
        const needles = orContains.map((c) => explainNode(c.needle, ctx)).join(" atau ");
        return `Jika ${haystackPhrase} mengandung ${needles}, maka ${explainNode(node.then, ctx)}. Selain itu, ${explainNode(node.else, ctx)}.`;
      }

      // Single contains check
      const contains = matchContains(node.cond);
      if (contains) {
        return `Jika ${explainNode(contains.haystack, ctx)} mengandung ${explainNode(contains.needle, ctx)}, maka ${explainNode(node.then, ctx)}. Selain itu, ${explainNode(node.else, ctx)}.`;
      }

      return `Jika ${explainNode(node.cond, ctx)}, maka ${explainNode(node.then, ctx)}. Selain itu, ${explainNode(node.else, ctx)}.`;
    }

    case "and":
      return `${explainNode(node.left, ctx)} dan ${explainNode(node.right, ctx)}`;
    case "or":
      return `${explainNode(node.left, ctx)} atau ${explainNode(node.right, ctx)}`;
    case "not": {
      // Special-case NOT(ISERROR(SEARCH(...))) at top level.
      const contains = matchContains(node);
      if (contains) {
        return `${explainNode(contains.haystack, ctx)} mengandung ${explainNode(contains.needle, ctx)}`;
      }
      return `bukan ${explainNode(node.arg, ctx)}`;
    }
    case "negate":
      return `negatif ${explainNode(node.arg, ctx)}`;

    case "search":
      return `mencari ${explainNode(node.find, ctx)} di dalam ${explainNode(node.within, ctx)}`;
    case "iserror":
      return `gagal mencari ${explainNode(node.arg, ctx)}`;

    case "binaryOp": {
      const verb = BINARY_OP_VERB[node.op];
      return `${explainNode(node.left, ctx)} ${verb} ${explainNode(node.right, ctx)}`;
    }

    case "funcCall": {
      const args = node.args.map((a) => explainNode(a, ctx)).join(", ");
      return `${node.name.toLowerCase()}(${args})`;
    }
  }
  // Should be unreachable — keep TypeScript happy.
  return "(ekspresi)";
}

/**
 * Produce a single Indonesian explanation for `ast`. The first character is
 * capitalised and the result ends with a period if it doesn't already.
 */
export function explainAst(ast: ASTNode, ctx: ExplainContext = {}): string {
  let text = explainNode(ast, ctx).trim();
  if (!text) return "";

  // Capitalise first character.
  text = text.charAt(0).toUpperCase() + text.slice(1);

  // Ensure the sentence ends with a full stop. If the last char is a quote
  // or close-paren, we still want the period afterwards for cleanliness.
  if (!/[.!?]$/.test(text)) text += ".";

  return text;
}
