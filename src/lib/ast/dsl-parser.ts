/**
 * Recursive-descent parser for the Expression Assistant DSL.
 *
 * Grammar (informal, lowest → highest precedence):
 *
 *   expr        := ternary
 *   ternary     := logicOr ("?" expr ":" expr)?
 *   logicOr     := logicAnd ("||" logicAnd)*
 *   logicAnd    := equality ("&&" equality)*
 *   equality    := comparison (("==" | "!=") comparison)*
 *   comparison  := addSub (("<" | ">" | "<=" | ">=") addSub)*
 *   addSub      := mulDiv (("+" | "-") mulDiv)*
 *   mulDiv      := unary (("*" | "/") unary)*
 *   unary       := ("!" | "-") unary | primary
 *   primary     := number | string | boolean
 *               | "(" expr ")"
 *               | callOrIdent
 *   callOrIdent := IDENT ("(" args? ")")?
 *   args        := expr ("," expr)*
 *
 * Identifier resolution uses a SymbolContext to map names to AST node
 * kinds:
 *   - Input columns ("debit", "kredit", "kategori", "keperluan")    → columnRef
 *   - Known formula keys ("omzet", "saldo", "kasbon_andi")           → outputRef
 *   - Anything else                                                  → diagnostic with nearest-match suggestion
 *
 * Function names are case-insensitive: `if`, `prev`, `row`, `search`,
 * `iserror`, `not`, `and`, `or`. The `prev(x)` helper requires a bare
 * identifier argument that resolves to a known formula key.
 */

import type { ASTNode, BinaryOp, InputColumn } from "./types";
import {
  tokenize,
  type Token,
  type TokenKind,
  type TokenizeError,
} from "./dsl-tokenizer";
import { FUNCTION_LIBRARY, FUNCTION_BY_NAME } from "./function-library";

/**
 * Lookup tables consumed by the parser to resolve bare identifiers.
 *
 * Keys are matched case-insensitively. The parser preserves whatever the
 * user typed in the resulting AST (e.g. `omzet` stays lowercase) — the
 * symbol context decides whether the name is known, not how it appears.
 */
export interface SymbolContext {
  /**
   * Map of input column alias → underlying AST column letter (C/D/E/F).
   *
   * Default mapping (see `DEFAULT_INPUT_COLUMNS`):
   *   kategori   → C
   *   debit      → D
   *   kredit     → E
   *   keperluan  → F
   *
   * Callers can extend or rename the aliases without touching the engine.
   */
  inputColumns: Record<string, InputColumn>;
  /**
   * List of valid `formula_key` values for `outputRef` / `prevOutput`.
   * Matched case-insensitively. Order doesn't matter.
   */
  formulaKeys: string[];
}

/** Default input column aliases used when no project-specific schema is provided. */
export const DEFAULT_INPUT_COLUMNS: Record<string, InputColumn> = {
  kategori: "C",
  debit: "D",
  kredit: "E",
  keperluan: "F",
};

export interface ParseDiagnostic {
  message: string;
  /** Inclusive 0-indexed source offset. */
  start: number;
  /** Exclusive 0-indexed source offset. */
  end: number;
  /** Optional suggestion (e.g. did-you-mean for unknown identifiers). */
  hint?: string;
}

export interface ParseResult {
  ast: ASTNode | null;
  diagnostics: ParseDiagnostic[];
}

/** Set of recognised function names (lowercase) for the call-form helper. */
const FN_NAMES = new Set([
  "if",
  "prev",
  "row",
  "search",
  "iserror",
  "not",
  "and",
  "or",
]);

/**
 * Names of every function in the extended library — used by `parseCallOrIdent`
 * to dispatch to a generic `funcCall` AST node when the function isn't one
 * of the legacy dedicated nodes above.
 */
const EXTENDED_FN_NAMES = new Set(
  FUNCTION_LIBRARY.map((f) => f.name.toLowerCase())
);

/**
 * Levenshtein distance for did-you-mean hints. Capped iteration cost at
 * len(a) × len(b) — fine for the small symbol tables we expect (<200).
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

/** Find the closest known name to `candidate` (case-insensitive). */
function nearestMatch(candidate: string, knownNames: string[]): string | null {
  let best: { name: string; d: number } | null = null;
  const lower = candidate.toLowerCase();
  for (const name of knownNames) {
    const d = distance(lower, name.toLowerCase());
    if (best === null || d < best.d) best = { name, d };
  }
  // Only suggest if reasonably close. 2 fits typos like "omzet" vs "omzeit".
  if (best && best.d <= Math.max(2, Math.floor(candidate.length / 3))) {
    return best.name;
  }
  return null;
}

/**
 * Parse a DSL source string into an AST. The result always includes a
 * diagnostics list — an empty list means parsing succeeded.
 */
export function parseDsl(src: string, ctx: SymbolContext): ParseResult {
  const { tokens, errors: lexErrors } = tokenize(src);
  const diagnostics: ParseDiagnostic[] = lexErrors.map(toDiagnostic);

  const parser = new Parser(tokens, ctx, diagnostics);
  let ast: ASTNode | null = null;
  try {
    ast = parser.parseProgram();
  } catch (e) {
    if (e instanceof ParserError) {
      diagnostics.push({
        message: e.message,
        start: e.token.start,
        end: e.token.end,
      });
    } else {
      throw e;
    }
  }

  return { ast, diagnostics };
}

function toDiagnostic(e: TokenizeError): ParseDiagnostic {
  return { message: e.message, start: e.start, end: e.end };
}

class ParserError extends Error {
  constructor(message: string, public readonly token: Token) {
    super(message);
    this.name = "ParserError";
  }
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly ctx: SymbolContext,
    private readonly diagnostics: ParseDiagnostic[]
  ) {}

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[idx];
  }

  private consume(): Token {
    const t = this.tokens[this.pos];
    if (t.kind !== "eof") this.pos += 1;
    return t;
  }

  private expect(kind: TokenKind, label?: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new ParserError(
        `Diharapkan ${label ?? kind}, ditemukan "${t.text || "(akhir)"}"`,
        t
      );
    }
    return this.consume();
  }

  private match(...kinds: TokenKind[]): Token | null {
    const t = this.peek();
    if (kinds.includes(t.kind)) return this.consume();
    return null;
  }

  parseProgram(): ASTNode {
    const t = this.peek();
    if (t.kind === "eof") {
      throw new ParserError("Rumus kosong.", t);
    }
    const expr = this.parseExpr();
    const trailing = this.peek();
    if (trailing.kind !== "eof") {
      throw new ParserError(
        `Token tidak diharapkan: "${trailing.text}"`,
        trailing
      );
    }
    return expr;
  }

  // expr := ternary
  private parseExpr(): ASTNode {
    return this.parseTernary();
  }

  // ternary := logicOr ("?" expr ":" expr)?
  private parseTernary(): ASTNode {
    const cond = this.parseLogicOr();
    if (this.match("qmark")) {
      const thenBranch = this.parseExpr();
      this.expect("colon", '":" pada ternary');
      const elseBranch = this.parseExpr();
      return { type: "if", cond, then: thenBranch, else: elseBranch };
    }
    return cond;
  }

  // logicOr := logicAnd ("||" logicAnd)*
  private parseLogicOr(): ASTNode {
    let left = this.parseLogicAnd();
    while (this.match("oror")) {
      const right = this.parseLogicAnd();
      left = { type: "or", left, right };
    }
    return left;
  }

  // logicAnd := equality ("&&" equality)*
  private parseLogicAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.match("andand")) {
      const right = this.parseEquality();
      left = { type: "and", left, right };
    }
    return left;
  }

  // equality := comparison (("==" | "!=") comparison)*
  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (true) {
      const op = this.match("eq", "neq");
      if (!op) break;
      const right = this.parseComparison();
      left = {
        type: "binaryOp",
        op: op.kind === "eq" ? "=" : "<>",
        left,
        right,
      };
    }
    return left;
  }

  // comparison := addSub (("<" | ">" | "<=" | ">=") addSub)*
  private parseComparison(): ASTNode {
    let left = this.parseAddSub();
    while (true) {
      const op = this.match("lt", "gt", "lte", "gte");
      if (!op) break;
      const right = this.parseAddSub();
      const map: Record<string, BinaryOp> = {
        lt: "<",
        gt: ">",
        lte: "<=",
        gte: ">=",
      };
      left = { type: "binaryOp", op: map[op.kind], left, right };
    }
    return left;
  }

  // addSub := mulDiv (("+" | "-") mulDiv)*
  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();
    while (true) {
      const op = this.match("plus", "minus");
      if (!op) break;
      const right = this.parseMulDiv();
      left = {
        type: "binaryOp",
        op: op.kind === "plus" ? "+" : "-",
        left,
        right,
      };
    }
    return left;
  }

  // mulDiv := unary (("*" | "/") unary)*
  private parseMulDiv(): ASTNode {
    let left = this.parseUnary();
    while (true) {
      const op = this.match("star", "slash");
      if (!op) break;
      const right = this.parseUnary();
      left = {
        type: "binaryOp",
        op: op.kind === "star" ? "*" : "/",
        left,
        right,
      };
    }
    return left;
  }

  // unary := ("!" | "-") unary | primary
  private parseUnary(): ASTNode {
    if (this.match("bang")) {
      return { type: "not", arg: this.parseUnary() };
    }
    if (this.match("minus")) {
      return { type: "negate", arg: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  // primary := number | string | boolean | "(" expr ")" | "[" ident "]" | callOrIdent
  private parsePrimary(): ASTNode {
    const t = this.peek();

    if (t.kind === "number") {
      this.consume();
      return { type: "literal", value: t.value as number };
    }
    if (t.kind === "string") {
      this.consume();
      return { type: "literal", value: t.value as string };
    }
    if (t.kind === "boolean") {
      this.consume();
      return { type: "literal", value: t.value as boolean };
    }
    if (t.kind === "lparen") {
      this.consume();
      const expr = this.parseExpr();
      this.expect("rparen", '")"');
      return expr;
    }
    // [ident] — column or formula key reference (AppSheet-style)
    if (t.kind === "lbracket") {
      this.consume(); // [
      const nameTok = this.expect("ident", "nama kolom atau rumus");
      this.expect("rbracket", '"]"');
      return this.resolveIdent(nameTok, nameTok.text);
    }
    if (t.kind === "ident") {
      return this.parseCallOrIdent();
    }

    throw new ParserError(
      `Diharapkan ekspresi, ditemukan "${t.text || "(akhir)"}"`,
      t
    );
  }

  private parseCallOrIdent(): ASTNode {
    const idTok = this.consume();
    const name = idTok.text;

    // Function call — bare ident followed by "(" is always a function.
    if (this.peek().kind === "lparen") {
      this.consume(); // (
      const args: ASTNode[] = [];
      if (this.peek().kind !== "rparen") {
        args.push(this.parseExpr());
        while (this.match("comma")) {
          args.push(this.parseExpr());
        }
      }
      this.expect("rparen", '")"');
      return this.buildCall(idTok, name, args);
    }

    // Bare ident without [] — guide user to use [nama] syntax.
    // We still try to resolve it so parsing can continue and produce
    // a useful AST for the rest of the expression.
    const lower = name.toLowerCase();
    const isKnownColumn = Object.keys(this.ctx.inputColumns).some(
      (a) => a.toLowerCase() === lower
    );
    const isKnownFormula = this.ctx.formulaKeys.some(
      (k) => k.toLowerCase() === lower
    );
    if (isKnownColumn || isKnownFormula) {
      this.diagnostics.push({
        message: `Gunakan [${name}] untuk merujuk kolom atau rumus.`,
        start: idTok.start,
        end: idTok.end,
        hint: `Tulis [${name}] bukan ${name}`,
      });
      return this.resolveIdent(idTok, name);
    }

    // Unknown bare ident — could be a mistyped function or column.
    return this.resolveIdent(idTok, name);
  }

  private buildCall(idTok: Token, rawName: string, args: ASTNode[]): ASTNode {
    const name = rawName.toLowerCase();
    if (!FN_NAMES.has(name) && !EXTENDED_FN_NAMES.has(name)) {
      const known = [
        ...FN_NAMES,
        ...FUNCTION_LIBRARY.map((f) => f.name.toLowerCase()),
      ];
      const hint = nearestMatch(rawName, known);
      this.diagnostics.push({
        message: `Fungsi "${rawName}" tidak dikenal.`,
        start: idTok.start,
        end: idTok.end,
        hint: hint ? `Maksudnya "${hint.toUpperCase()}"?` : undefined,
      });
      return { type: "literal", value: 0 };
    }

    // Generic dispatch for extended-library functions (math/text/date/agg)
    if (!FN_NAMES.has(name)) {
      const def = FUNCTION_BY_NAME[name.toUpperCase()];
      if (def) {
        if (
          args.length < def.arity.min ||
          args.length > def.arity.max
        ) {
          const range =
            def.arity.max === Infinity
              ? `${def.arity.min}+`
              : def.arity.min === def.arity.max
                ? String(def.arity.min)
                : `${def.arity.min}..${def.arity.max}`;
          this.diagnostics.push({
            message: `${def.name} butuh ${range} argumen, diberi ${args.length}.`,
            start: idTok.start,
            end: idTok.end,
          });
        }
        return { type: "funcCall", name: def.name, args };
      }
    }

    const expectArity = (expected: number, label: string) => {
      if (args.length !== expected) {
        this.diagnostics.push({
          message: `${label} butuh ${expected} argumen, diberi ${args.length}.`,
          start: idTok.start,
          end: idTok.end,
        });
      }
    };

    switch (name) {
      case "if": {
        expectArity(3, "if");
        const [cond, t, e] = pad3(args);
        return { type: "if", cond, then: t, else: e };
      }
      case "prev": {
        expectArity(1, "PREV");
        const arg = args[0] ?? { type: "literal", value: 0 };
        if (arg.type !== "outputRef") {
          this.diagnostics.push({
            message:
              'PREV(...) butuh nama rumus dalam kurung siku, mis. PREV([saldo]) atau PREV([omzet]).',
            start: idTok.start,
            end: idTok.end,
          });
          return { type: "literal", value: 0 };
        }
        return { type: "prevOutput", column: arg.column };
      }
      case "row":
        expectArity(0, "ROW");
        return { type: "row" };
      case "search": {
        expectArity(2, "SEARCH");
        const [find, within] = pad2(args);
        return { type: "search", find, within };
      }
      case "iserror": {
        expectArity(1, "ISERROR");
        return { type: "iserror", arg: args[0] ?? { type: "literal", value: 0 } };
      }
      case "not": {
        expectArity(1, "NOT");
        return { type: "not", arg: args[0] ?? { type: "literal", value: 0 } };
      }
      case "and": {
        expectArity(2, "AND");
        const [l, r] = pad2(args);
        return { type: "and", left: l, right: r };
      }
      case "or": {
        expectArity(2, "OR");
        const [l, r] = pad2(args);
        return { type: "or", left: l, right: r };
      }
    }
    return { type: "literal", value: 0 };
  }

  private resolveIdent(idTok: Token, rawName: string): ASTNode {
    const lower = rawName.toLowerCase();
    const inputCols = this.ctx.inputColumns;

    // Input columns first — they mask same-named formula keys (very unusual,
    // but defensive).
    for (const alias of Object.keys(inputCols)) {
      if (alias.toLowerCase() === lower) {
        return { type: "columnRef", column: inputCols[alias] };
      }
    }

    // Formula key match (case-insensitive but preserve original casing).
    for (const key of this.ctx.formulaKeys) {
      if (key.toLowerCase() === lower) {
        return { type: "outputRef", column: key };
      }
    }

    const known = [
      ...Object.keys(inputCols),
      ...this.ctx.formulaKeys,
      ...FN_NAMES,
    ];
    const hint = nearestMatch(rawName, known);
    this.diagnostics.push({
      message: `Identifier "${rawName}" tidak dikenal.`,
      start: idTok.start,
      end: idTok.end,
      hint: hint ? `Maksudnya "${hint}"?` : undefined,
    });
    // Treat as 0 so the rest of the expression still parses.
    return { type: "literal", value: 0 };
  }
}

function pad2(args: ASTNode[]): [ASTNode, ASTNode] {
  const zero: ASTNode = { type: "literal", value: 0 };
  return [args[0] ?? zero, args[1] ?? zero];
}

function pad3(args: ASTNode[]): [ASTNode, ASTNode, ASTNode] {
  const zero: ASTNode = { type: "literal", value: 0 };
  return [args[0] ?? zero, args[1] ?? zero, args[2] ?? zero];
}
