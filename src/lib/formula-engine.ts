/**
 * Data-driven finance calculation engine.
 *
 * Types for user-configurable column rules and category contributions,
 * plus a safe arithmetic formula evaluator (no eval, no external libs).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ColumnRuleType =
  | "saldo"
  | "accumulator"
  | "formula"
  | "kasbon_conditional"
  | "profit_share";

export interface KasbonConditions {
  categories: string[]; // e.g. ["PRIBADI-A"] or ["INVESTOR","BIAYA"]
  keperluan_contains: string | null; // substring match on keperluan (case-insensitive)
  amount: "kredit_minus_debit" | "debit_minus_kredit";
}

export interface FinanceColumnRule {
  id: string;
  column_name: string;
  display_name: string;
  rule_type: ColumnRuleType;
  formula_expression: string | null; // for type "formula"
  kasbon_conditions: KasbonConditions | null; // for type "kasbon_conditional"
  is_system: number; // 1 = cannot be deleted/type-changed by user
  display_order: number;
}

/** Single contribution from a category to an accumulator column. */
export interface CategoryContributionRule {
  column: string; // target keuangan column (e.g. "omzet")
  amount_field: "debit" | "kredit"; // which transaction field to add
  sign: 1 | -1; // typically 1; use -1 to subtract
}

export interface CategoryWithContributions {
  category_code: string;
  metric_contributions: CategoryContributionRule[] | null;
}

// ── Formula Evaluator ─────────────────────────────────────────────────────

/**
 * Tokenise an arithmetic expression into strings.
 * Supports: numbers, identifiers (a-z, 0-9, _), operators + - * /, parentheses.
 */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === " " || ch === "\t" || ch === "\n") { i++; continue; }
    if ("+-*/()".includes(ch)) { tokens.push(ch); i++; continue; }
    if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let name = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) name += expr[i++];
      tokens.push(name);
      continue;
    }
    throw new Error(`Unknown character in formula: "${ch}"`);
  }
  return tokens;
}

/**
 * Evaluate a simple arithmetic expression with variable substitution.
 *
 * Supported:  +  -  *  /  ( )  and variable names from the `scope` map.
 * Unknown variables resolve to 0 (permissive – missing data doesn't crash).
 * No eval(), no external dependencies.
 */
export function evaluateFormula(
  expression: string,
  scope: Record<string, number>
): number {
  const tokens = tokenize(expression);
  let pos = 0;

  function peek(): string | undefined { return tokens[pos]; }
  function consume(): string { return tokens[pos++]; }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      if (op === "/") {
        if (right === 0) return 0; // avoid division by zero
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    const tok = peek();
    if (tok === "-") { consume(); return -parseFactor(); }
    if (tok === "+") { consume(); return parseFactor(); }
    if (tok === "(") {
      consume();
      const val = parseExpr();
      if (peek() !== ")") throw new Error("Formula: missing closing parenthesis");
      consume();
      return val;
    }
    if (tok !== undefined && /^[0-9]/.test(tok)) {
      return parseFloat(consume());
    }
    if (tok !== undefined && /^[a-zA-Z_]/.test(tok)) {
      const name = consume();
      return scope[name] ?? 0;
    }
    throw new Error(`Formula: unexpected token "${tok ?? "EOF"}"`);
  }

  const result = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Formula: unexpected trailing tokens "${tokens.slice(pos).join(" ")}"`);
  }
  return result;
}

/**
 * Validate a formula expression – returns an error message or null if valid.
 * Also detects direct self-reference (laba_bersih referencing laba_bersih).
 */
export function validateFormula(
  expression: string,
  columnName: string,
  availableColumns: string[]
): string | null {
  try {
    const scope: Record<string, number> = {};
    for (const col of availableColumns) scope[col] = 1;
    evaluateFormula(expression, scope);
  } catch (e) {
    return (e as Error).message;
  }
  // Simple self-reference check
  const tokens = tokenize(expression);
  if (tokens.includes(columnName)) {
    return `Formula tidak boleh mereferensikan kolom itu sendiri (${columnName})`;
  }
  return null;
}

// ── Default rules matching current hardcoded logic ────────────────────────

export const DEFAULT_COLUMN_RULES: FinanceColumnRule[] = [
  { id: "rule-saldo", column_name: "saldo", display_name: "Saldo", rule_type: "saldo", formula_expression: null, kasbon_conditions: null, is_system: 1, display_order: 10 },
  { id: "rule-omzet", column_name: "omzet", display_name: "Omzet", rule_type: "accumulator", formula_expression: null, kasbon_conditions: null, is_system: 0, display_order: 20 },
  { id: "rule-biaya-ops", column_name: "biaya_operasional", display_name: "Biaya Operasional", rule_type: "accumulator", formula_expression: null, kasbon_conditions: null, is_system: 0, display_order: 30 },
  { id: "rule-biaya-bahan", column_name: "biaya_bahan", display_name: "Biaya Bahan", rule_type: "accumulator", formula_expression: null, kasbon_conditions: null, is_system: 0, display_order: 40 },
  { id: "rule-laba", column_name: "laba_bersih", display_name: "Laba Bersih", rule_type: "formula", formula_expression: "omzet - biaya_operasional - biaya_bahan", kasbon_conditions: null, is_system: 0, display_order: 50 },
  { id: "rule-kasbon-anwar", column_name: "kasbon_anwar", display_name: "Kasbon Mitra 1", rule_type: "kasbon_conditional", formula_expression: null, kasbon_conditions: { categories: ["PRIBADI-A"], keperluan_contains: null, amount: "kredit_minus_debit" }, is_system: 0, display_order: 60 },
  { id: "rule-kasbon-suri", column_name: "kasbon_suri", display_name: "Kasbon Mitra 2", rule_type: "kasbon_conditional", formula_expression: null, kasbon_conditions: { categories: ["PRIBADI-S"], keperluan_contains: null, amount: "kredit_minus_debit" }, is_system: 0, display_order: 70 },
  { id: "rule-kasbon-cahaya", column_name: "kasbon_cahaya", display_name: "Kasbon Karyawan 1", rule_type: "kasbon_conditional", formula_expression: null, kasbon_conditions: { categories: ["INVESTOR", "BIAYA"], keperluan_contains: "cahaya", amount: "kredit_minus_debit" }, is_system: 0, display_order: 80 },
  { id: "rule-kasbon-dinil", column_name: "kasbon_dinil", display_name: "Kasbon Karyawan 2", rule_type: "kasbon_conditional", formula_expression: null, kasbon_conditions: { categories: ["INVESTOR", "BIAYA"], keperluan_contains: "dinil", amount: "kredit_minus_debit" }, is_system: 0, display_order: 90 },
  { id: "rule-bagi-hasil-anwar", column_name: "bagi_hasil_anwar", display_name: "Bagi Hasil Slot 1", rule_type: "profit_share", formula_expression: null, kasbon_conditions: null, is_system: 1, display_order: 100 },
  { id: "rule-bagi-hasil-suri", column_name: "bagi_hasil_suri", display_name: "Bagi Hasil Slot 2", rule_type: "profit_share", formula_expression: null, kasbon_conditions: null, is_system: 1, display_order: 110 },
  { id: "rule-bagi-hasil-gemi", column_name: "bagi_hasil_gemi", display_name: "Bagi Hasil Slot 3", rule_type: "profit_share", formula_expression: null, kasbon_conditions: null, is_system: 1, display_order: 120 },
];

export const DEFAULT_CATEGORY_CONTRIBUTIONS: Record<string, CategoryContributionRule[]> = {
  OMZET:   [{ column: "omzet", amount_field: "debit", sign: 1 }],
  PIUTANG: [{ column: "omzet", amount_field: "debit", sign: 1 }],
  LUNAS:   [{ column: "omzet", amount_field: "debit", sign: 1 }],
  BIAYA:   [{ column: "biaya_operasional", amount_field: "kredit", sign: 1 }],
  TABUNGAN:[{ column: "biaya_operasional", amount_field: "kredit", sign: 1 }],
  KOMISI:  [{ column: "biaya_operasional", amount_field: "kredit", sign: 1 }],
  HPP:     [{ column: "biaya_bahan", amount_field: "kredit", sign: 1 }],
  RETUR_PENJUALAN: [{ column: "omzet", amount_field: "kredit", sign: -1 }],
  RETUR_PENJUALAN_NONCASH: [{ column: "omzet", amount_field: "kredit", sign: -1 }],
  RETUR_HPP: [{ column: "biaya_bahan", amount_field: "debit", sign: -1 }],
  RETUR_PEMBELIAN: [],
};

/** Resolve KasbonConditions from raw DB value (string or object). */
export function parseKasbonConditions(raw: unknown): KasbonConditions | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as KasbonConditions; } catch { return null; }
  }
  return raw as KasbonConditions;
}

/** Resolve CategoryContributionRule[] from raw DB value. */
export function parseCategoryContributions(raw: unknown): CategoryContributionRule[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as CategoryContributionRule[]; } catch { return []; }
  }
  if (Array.isArray(raw)) return raw as CategoryContributionRule[];
  return [];
}
