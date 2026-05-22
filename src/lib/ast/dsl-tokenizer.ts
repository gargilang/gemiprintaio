/**
 * Tokenizer for the Expression Assistant DSL.
 *
 * The DSL is a small JS-like surface: identifiers, number/string/boolean
 * literals, parentheses, comma, and a fixed set of operators (`+ - * /`,
 * `== != > < >= <=`, `&& || !`, `?`, `:`).
 *
 * The tokenizer is intentionally permissive — it always returns a token
 * array (even when characters were skipped) plus a list of errors with
 * source positions, so the parser can keep going and the UI can highlight
 * problems inline.
 */

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "boolean"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "andand"
  | "oror"
  | "bang"
  | "qmark"
  | "colon"
  | "eof";

export interface Token {
  kind: TokenKind;
  /** Raw source text covered by the token. */
  text: string;
  /**
   * Decoded value for literals — number for `number`, boolean for `boolean`,
   * unescaped string for `string`. Other tokens leave it undefined.
   */
  value?: number | boolean | string;
  /** 0-indexed inclusive start offset in the source string. */
  start: number;
  /** 0-indexed exclusive end offset in the source string. */
  end: number;
}

export interface TokenizeError {
  message: string;
  start: number;
  end: number;
}

export interface TokenizeResult {
  tokens: Token[];
  errors: TokenizeError[];
}

/** Identifier first-character matcher: ASCII letter or underscore. */
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

/** Identifier continuation matcher: identifier-start plus digits. */
function isIdentCont(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Convert a source string into a stream of tokens. */
export function tokenize(src: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: TokenizeError[] = [];
  let i = 0;
  const n = src.length;

  function push(kind: TokenKind, start: number, end: number, value?: Token["value"]): void {
    tokens.push({ kind, text: src.slice(start, end), start, end, value });
  }

  while (i < n) {
    const ch = src[i];

    // Skip whitespace (incl. newlines).
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // Single-line comments `// ...` so users can annotate their formulas.
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }

    const start = i;

    // String literals: "..." with \\ \" \n \t escapes.
    if (ch === '"') {
      i += 1;
      let value = "";
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === "\\" && i + 1 < n) {
          const next = src[i + 1];
          if (next === "n") value += "\n";
          else if (next === "t") value += "\t";
          else if (next === "\\") value += "\\";
          else if (next === '"') value += '"';
          else value += next;
          i += 2;
          continue;
        }
        if (c === '"') {
          i += 1;
          closed = true;
          break;
        }
        value += c;
        i += 1;
      }
      if (!closed) {
        errors.push({
          message: 'String literal tidak ditutup dengan tanda kutip "',
          start,
          end: i,
        });
      }
      push("string", start, i, value);
      continue;
    }

    // Number literals: digits with optional fractional part. No leading +/-.
    if (isDigit(ch)) {
      while (i < n && isDigit(src[i])) i += 1;
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) {
        i += 1;
        while (i < n && isDigit(src[i])) i += 1;
      }
      const text = src.slice(start, i);
      const num = Number(text);
      if (!Number.isFinite(num)) {
        errors.push({ message: `Angka tidak valid: ${text}`, start, end: i });
      }
      push("number", start, i, num);
      continue;
    }

    // Identifiers and boolean keywords.
    if (isIdentStart(ch)) {
      while (i < n && isIdentCont(src[i])) i += 1;
      const text = src.slice(start, i);
      if (text === "true") push("boolean", start, i, true);
      else if (text === "false") push("boolean", start, i, false);
      else push("ident", start, i);
      continue;
    }

    // Multi-char operators first, then single-char.
    if (ch === "=" && src[i + 1] === "=") {
      i += 2;
      push("eq", start, i);
      continue;
    }
    if (ch === "!" && src[i + 1] === "=") {
      i += 2;
      push("neq", start, i);
      continue;
    }
    if (ch === ">" && src[i + 1] === "=") {
      i += 2;
      push("gte", start, i);
      continue;
    }
    if (ch === "<" && src[i + 1] === "=") {
      i += 2;
      push("lte", start, i);
      continue;
    }
    if (ch === "&" && src[i + 1] === "&") {
      i += 2;
      push("andand", start, i);
      continue;
    }
    if (ch === "|" && src[i + 1] === "|") {
      i += 2;
      push("oror", start, i);
      continue;
    }

    switch (ch) {
      case "(":
        i += 1;
        push("lparen", start, i);
        continue;
      case ")":
        i += 1;
        push("rparen", start, i);
        continue;
      case "[":
        i += 1;
        push("lbracket", start, i);
        continue;
      case "]":
        i += 1;
        push("rbracket", start, i);
        continue;
      case ",":
        i += 1;
        push("comma", start, i);
        continue;
      case "+":
        i += 1;
        push("plus", start, i);
        continue;
      case "-":
        i += 1;
        push("minus", start, i);
        continue;
      case "*":
        i += 1;
        push("star", start, i);
        continue;
      case "/":
        i += 1;
        push("slash", start, i);
        continue;
      case ">":
        i += 1;
        push("gt", start, i);
        continue;
      case "<":
        i += 1;
        push("lt", start, i);
        continue;
      case "!":
        i += 1;
        push("bang", start, i);
        continue;
      case "?":
        i += 1;
        push("qmark", start, i);
        continue;
      case ":":
        i += 1;
        push("colon", start, i);
        continue;
      default:
        // Single equals — not a comparison in this DSL; flag it so users see
        // the hint to use `==` instead.
        if (ch === "=") {
          errors.push({
            message: 'Gunakan "==" untuk perbandingan, bukan "="',
            start,
            end: i + 1,
          });
          i += 1;
          push("eq", start, i);
          continue;
        }
        errors.push({
          message: `Karakter tidak dikenal: "${ch}"`,
          start,
          end: i + 1,
        });
        i += 1;
        continue;
    }
  }

  push("eof", n, n);
  return { tokens, errors };
}
