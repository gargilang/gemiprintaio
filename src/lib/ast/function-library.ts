/**
 * Function library — single source of truth for every built-in function the
 * Expression Assistant DSL exposes BEYOND the dedicated AST nodes (`if`,
 * `prev`, `row`, `search`, `iserror`, `not`, `and`, `or`).
 *
 * Adding a new function is one new entry here. Tokenizer, parser, evaluator,
 * autocomplete, AI prompt, and the Pustaka Rumus tab all read from this
 * registry, so behaviour stays in lock-step automatically.
 *
 * Categories
 * ----------
 *   logic        — IF, NOT, AND, OR, IFS, ISERROR
 *   text         — SEARCH, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, CONCAT
 *   math         — ABS, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, MOD,
 *                  POWER, MIN, MAX
 *   date         — TODAY, MONTH, YEAR, DAY, EDATE, EOMONTH, DATEDIF
 *   aggregation  — SUM, AVERAGE, COUNT, SUMIF, COUNTIF, AVERAGEIF
 *   reference    — PREV, ROW (special — handled by dedicated AST nodes)
 *
 * Each entry declares:
 *   - canonical UPPERCASE `name`
 *   - human-readable `category`
 *   - `signature` shown in autocomplete + Pustaka Rumus
 *   - `description` (Indonesian) for the catalog
 *   - `example` (Indonesian)
 *   - `arity` for parser-side arity checking
 *   - optional `evaluate` for the runtime; absent for functions handled by
 *     legacy dedicated AST nodes
 *
 * The `evaluate` callback receives plain JS values (numbers, strings,
 * booleans) — it does NOT recurse into AST nodes. The parser is responsible
 * for emitting a `funcCall` AST node, and the evaluator handles `funcCall`
 * by looking up the entry here, evaluating each argument, then calling
 * `evaluate(args)`.
 */

import { FormulaEvalError, SearchNotFoundError, type Value } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toStr(v: Value): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return v ? "TRUE" : "FALSE";
}

/** Parse an ISO-ish date or date-string and return a JS Date. */
function toDate(v: Value): Date {
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === "number") {
    // Treat as Unix epoch milliseconds for safety.
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  throw new FormulaEvalError(`Tanggal tidak valid: ${String(v)}`);
}

/** Format a Date back as YYYY-MM-DD. */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Function registry ────────────────────────────────────────────────────────

export type FunctionCategory =
  | "logic"
  | "text"
  | "math"
  | "date"
  | "aggregation"
  | "reference";

export interface FunctionArity {
  min: number;
  /** Use Infinity for variadic. */
  max: number;
}

export interface FunctionDef {
  name: string;
  category: FunctionCategory;
  signature: string;
  description: string;
  example: string;
  arity: FunctionArity;
  /**
   * Per-row implementation. Receives evaluated argument values plus a
   * row context for functions that need it (aggregation will use this
   * later). Returns a single value.
   *
   * Aggregation functions are listed here for catalog purposes but their
   * `evaluate` is `null` — they're handled by a separate aggregation pass
   * that the evaluator runs before per-row evaluation.
   */
  evaluate: ((args: Value[]) => Value) | null;
  /**
   * Like `evaluate` but receives the per-row eval context too. Used for
   * functions that need to read other formula values for the current row
   * (e.g. SUM_GROUP which sums every formula in a given formula_group).
   * When set, takes precedence over `evaluate`.
   */
  evaluateWithContext?: (
    args: Value[],
    ctx: { currentOutputs: Record<string, Value>; groupKeys: Record<string, string[]> }
  ) => Value;
}

export const FUNCTION_LIBRARY: FunctionDef[] = [
  // ─── Logic ───────────────────────────────────────────────────────────────
  {
    name: "IF",
    category: "logic",
    signature: "IF(kondisi, lalu, kalauTidak)",
    description: "Pilih nilai sesuai kondisi. Sama dengan ternary kondisi ? a : b.",
    example: 'IF([omzet] > 0, [omzet] * 0.05, 0)',
    arity: { min: 3, max: 3 },
    evaluate: null, // handled by dedicated `if` AST node
  },
  {
    name: "IFS",
    category: "logic",
    signature: "IFS(kondisi1, hasil1, kondisi2, hasil2, ...)",
    description: "Cek beberapa kondisi berurutan; pakai hasil pertama yang kondisinya benar. Argumen harus genap.",
    example: 'IFS([omzet] > 1000000, "A", [omzet] > 500000, "B", true, "C")',
    arity: { min: 2, max: Infinity },
    evaluate: (args) => {
      if (args.length % 2 !== 0) {
        throw new FormulaEvalError("IFS butuh argumen genap (kondisi/hasil berpasangan).");
      }
      for (let i = 0; i < args.length; i += 2) {
        if (isTruthy(args[i])) return args[i + 1];
      }
      throw new FormulaEvalError("IFS: tidak ada kondisi yang cocok.");
    },
  },
  {
    name: "NOT",
    category: "logic",
    signature: "NOT(ekspresi)",
    description: "Negasi boolean.",
    example: 'NOT(ISERROR(SEARCH("OMZET", [kategori])))',
    arity: { min: 1, max: 1 },
    evaluate: null, // handled by dedicated `not` AST node
  },
  {
    name: "AND",
    category: "logic",
    signature: "AND(a, b, ...)",
    description: "Kembalikan benar bila SEMUA argumen benar.",
    example: 'AND([omzet] > 0, [debit] > 0)',
    arity: { min: 2, max: Infinity },
    evaluate: null, // dedicated 2-arg `and` node; variadic form falls through to funcCall path
  },
  {
    name: "OR",
    category: "logic",
    signature: "OR(a, b, ...)",
    description: "Kembalikan benar bila SALAH SATU argumen benar.",
    example: 'OR([kategori] == "OMZET", [kategori] == "PIUTANG")',
    arity: { min: 2, max: Infinity },
    evaluate: null, // dedicated 2-arg `or` node
  },
  {
    name: "ISERROR",
    category: "logic",
    signature: "ISERROR(ekspresi)",
    description: "Kembalikan benar bila ekspresi melempar error. Biasanya membungkus SEARCH().",
    example: 'ISERROR(SEARCH("OMZET", [kategori]))',
    arity: { min: 1, max: 1 },
    evaluate: null, // dedicated `iserror` AST node
  },

  // ─── Text ─────────────────────────────────────────────────────────────────
  {
    name: "SEARCH",
    category: "text",
    signature: 'SEARCH("teks", [kolom])',
    description: "Cari substring di teks (case-insensitive). Lemparkan error jika tidak ada.",
    example: 'SEARCH("OMZET", [kategori])',
    arity: { min: 2, max: 2 },
    evaluate: null, // dedicated `search` AST node
  },
  {
    name: "LEN",
    category: "text",
    signature: "LEN(teks)",
    description: "Panjang karakter dari sebuah teks.",
    example: 'LEN([keperluan])',
    arity: { min: 1, max: 1 },
    evaluate: ([s]) => toStr(s).length,
  },
  {
    name: "UPPER",
    category: "text",
    signature: "UPPER(teks)",
    description: "Ubah teks menjadi HURUF BESAR.",
    example: 'UPPER([kategori])',
    arity: { min: 1, max: 1 },
    evaluate: ([s]) => toStr(s).toUpperCase(),
  },
  {
    name: "LOWER",
    category: "text",
    signature: "LOWER(teks)",
    description: "Ubah teks menjadi huruf kecil.",
    example: 'LOWER([kategori])',
    arity: { min: 1, max: 1 },
    evaluate: ([s]) => toStr(s).toLowerCase(),
  },
  {
    name: "TRIM",
    category: "text",
    signature: "TRIM(teks)",
    description: "Hapus spasi di awal dan akhir teks.",
    example: 'TRIM([keperluan])',
    arity: { min: 1, max: 1 },
    evaluate: ([s]) => toStr(s).trim(),
  },
  {
    name: "LEFT",
    category: "text",
    signature: "LEFT(teks, jumlah)",
    description: "Ambil n karakter pertama dari teks.",
    example: 'LEFT([keperluan], 10)',
    arity: { min: 2, max: 2 },
    evaluate: ([s, n]) => toStr(s).slice(0, Math.max(0, Math.floor(toNum(n)))),
  },
  {
    name: "RIGHT",
    category: "text",
    signature: "RIGHT(teks, jumlah)",
    description: "Ambil n karakter terakhir dari teks.",
    example: 'RIGHT([keperluan], 4)',
    arity: { min: 2, max: 2 },
    evaluate: ([s, n]) => {
      const str = toStr(s);
      const k = Math.max(0, Math.floor(toNum(n)));
      return k >= str.length ? str : str.slice(str.length - k);
    },
  },
  {
    name: "CONCAT",
    category: "text",
    signature: "CONCAT(teks1, teks2, ...)",
    description: "Sambungkan beberapa teks menjadi satu.",
    example: 'CONCAT("INV-", [keperluan])',
    arity: { min: 1, max: Infinity },
    evaluate: (args) => args.map((a) => toStr(a)).join(""),
  },

  // ─── Math ────────────────────────────────────────────────────────────────
  {
    name: "ABS",
    category: "math",
    signature: "ABS(angka)",
    description: "Nilai absolut (selalu positif).",
    example: 'ABS([debit] - [kredit])',
    arity: { min: 1, max: 1 },
    evaluate: ([n]) => Math.abs(toNum(n)),
  },
  {
    name: "ROUND",
    category: "math",
    signature: "ROUND(angka, digit)",
    description: "Bulatkan angka ke n digit di belakang koma.",
    example: 'ROUND([omzet] * 0.11, 0)',
    arity: { min: 1, max: 2 },
    evaluate: ([n, d]) => {
      const dig = d === undefined ? 0 : Math.floor(toNum(d));
      const factor = Math.pow(10, dig);
      return Math.round(toNum(n) * factor) / factor;
    },
  },
  {
    name: "ROUNDUP",
    category: "math",
    signature: "ROUNDUP(angka, digit)",
    description: "Bulatkan angka ke atas (menjauh dari nol).",
    example: 'ROUNDUP([omzet] / 1000, 0)',
    arity: { min: 1, max: 2 },
    evaluate: ([n, d]) => {
      const dig = d === undefined ? 0 : Math.floor(toNum(d));
      const factor = Math.pow(10, dig);
      const v = toNum(n) * factor;
      return (v < 0 ? Math.floor(v) : Math.ceil(v)) / factor;
    },
  },
  {
    name: "ROUNDDOWN",
    category: "math",
    signature: "ROUNDDOWN(angka, digit)",
    description: "Bulatkan angka ke bawah (mendekat ke nol).",
    example: 'ROUNDDOWN([omzet] / 1000, 0)',
    arity: { min: 1, max: 2 },
    evaluate: ([n, d]) => {
      const dig = d === undefined ? 0 : Math.floor(toNum(d));
      const factor = Math.pow(10, dig);
      const v = toNum(n) * factor;
      return (v < 0 ? Math.ceil(v) : Math.floor(v)) / factor;
    },
  },
  {
    name: "CEILING",
    category: "math",
    signature: "CEILING(angka, kelipatan)",
    description: "Bulatkan angka ke kelipatan terdekat (ke atas).",
    example: 'CEILING([omzet], 1000)',
    arity: { min: 1, max: 2 },
    evaluate: ([n, m]) => {
      const mult = m === undefined ? 1 : toNum(m);
      if (mult === 0) return 0;
      return Math.ceil(toNum(n) / mult) * mult;
    },
  },
  {
    name: "FLOOR",
    category: "math",
    signature: "FLOOR(angka, kelipatan)",
    description: "Bulatkan angka ke kelipatan terdekat (ke bawah).",
    example: 'FLOOR([omzet], 1000)',
    arity: { min: 1, max: 2 },
    evaluate: ([n, m]) => {
      const mult = m === undefined ? 1 : toNum(m);
      if (mult === 0) return 0;
      return Math.floor(toNum(n) / mult) * mult;
    },
  },
  {
    name: "MOD",
    category: "math",
    signature: "MOD(angka, pembagi)",
    description: "Sisa pembagian (modulo).",
    example: 'MOD(ROW(), 2)',
    arity: { min: 2, max: 2 },
    evaluate: ([n, d]) => {
      const denom = toNum(d);
      if (denom === 0) return 0;
      return toNum(n) % denom;
    },
  },
  {
    name: "POWER",
    category: "math",
    signature: "POWER(angka, pangkat)",
    description: "Pangkat — angka pangkat pangkat.",
    example: 'POWER([omzet], 2)',
    arity: { min: 2, max: 2 },
    evaluate: ([n, p]) => Math.pow(toNum(n), toNum(p)),
  },
  {
    name: "MIN",
    category: "math",
    signature: "MIN(a, b, ...)",
    description: "Kembalikan nilai terkecil dari semua argumen.",
    example: 'MIN([debit], [kredit])',
    arity: { min: 1, max: Infinity },
    evaluate: (args) => Math.min(...args.map(toNum)),
  },
  {
    name: "MAX",
    category: "math",
    signature: "MAX(a, b, ...)",
    description: "Kembalikan nilai terbesar dari semua argumen.",
    example: 'MAX([debit], [kredit])',
    arity: { min: 1, max: Infinity },
    evaluate: (args) => Math.max(...args.map(toNum)),
  },

  // ─── Date ────────────────────────────────────────────────────────────────
  {
    name: "TODAY",
    category: "date",
    signature: "TODAY()",
    description: "Tanggal hari ini (format YYYY-MM-DD).",
    example: 'TODAY()',
    arity: { min: 0, max: 0 },
    evaluate: () => fmtDate(new Date()),
  },
  {
    name: "YEAR",
    category: "date",
    signature: "YEAR(tanggal)",
    description: "Tahun dari sebuah tanggal.",
    example: 'YEAR([tanggal])',
    arity: { min: 1, max: 1 },
    evaluate: ([d]) => toDate(d).getFullYear(),
  },
  {
    name: "MONTH",
    category: "date",
    signature: "MONTH(tanggal)",
    description: "Bulan (1-12) dari sebuah tanggal.",
    example: 'MONTH([tanggal])',
    arity: { min: 1, max: 1 },
    evaluate: ([d]) => toDate(d).getMonth() + 1,
  },
  {
    name: "DAY",
    category: "date",
    signature: "DAY(tanggal)",
    description: "Hari (1-31) dari sebuah tanggal.",
    example: 'DAY([tanggal])',
    arity: { min: 1, max: 1 },
    evaluate: ([d]) => toDate(d).getDate(),
  },
  {
    name: "EDATE",
    category: "date",
    signature: "EDATE(tanggal, bulan)",
    description: "Tanggal n bulan setelah tanggal awal (boleh negatif).",
    example: 'EDATE([tanggal], 3)',
    arity: { min: 2, max: 2 },
    evaluate: ([d, m]) => {
      const date = toDate(d);
      const months = Math.floor(toNum(m));
      const out = new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
      return fmtDate(out);
    },
  },
  {
    name: "EOMONTH",
    category: "date",
    signature: "EOMONTH(tanggal, bulan)",
    description: "Tanggal terakhir di bulan ke-n setelah tanggal awal.",
    example: 'EOMONTH([tanggal], 0)',
    arity: { min: 2, max: 2 },
    evaluate: ([d, m]) => {
      const date = toDate(d);
      const months = Math.floor(toNum(m));
      const out = new Date(date.getFullYear(), date.getMonth() + months + 1, 0);
      return fmtDate(out);
    },
  },
  {
    name: "DATEDIF",
    category: "date",
    signature: 'DATEDIF(awal, akhir, "Y"|"M"|"D")',
    description: "Selisih dua tanggal dalam tahun (Y), bulan (M), atau hari (D).",
    example: 'DATEDIF([tanggal], TODAY(), "D")',
    arity: { min: 3, max: 3 },
    evaluate: ([a, b, unit]) => {
      const start = toDate(a);
      const end = toDate(b);
      const u = toStr(unit).toUpperCase();
      const ms = end.getTime() - start.getTime();
      if (u === "D") return Math.floor(ms / (1000 * 60 * 60 * 24));
      if (u === "M") {
        return (
          (end.getFullYear() - start.getFullYear()) * 12 +
          (end.getMonth() - start.getMonth()) -
          (end.getDate() < start.getDate() ? 1 : 0)
        );
      }
      if (u === "Y") {
        let y = end.getFullYear() - start.getFullYear();
        if (
          end.getMonth() < start.getMonth() ||
          (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())
        ) {
          y -= 1;
        }
        return y;
      }
      throw new FormulaEvalError(`DATEDIF unit harus "Y", "M", atau "D" (diberi: ${u})`);
    },
  },

  // ─── Aggregation (handled by evaluator's aggregation pass) ───────────────
  {
    name: "SUM",
    category: "aggregation",
    signature: "SUM([kolom_atau_rumus])",
    description: "Total semua nilai pada satu kolom (input atau rumus) di seluruh dataset.",
    example: 'SUM([debit])',
    arity: { min: 1, max: 1 },
    evaluate: null, // handled by aggregation pass
  },
  {
    name: "AVERAGE",
    category: "aggregation",
    signature: "AVERAGE([kolom_atau_rumus])",
    description: "Rata-rata nilai pada satu kolom di seluruh dataset.",
    example: 'AVERAGE([debit])',
    arity: { min: 1, max: 1 },
    evaluate: null,
  },
  {
    name: "COUNT",
    category: "aggregation",
    signature: "COUNT([kolom])",
    description: "Jumlah baris dengan nilai numerik pada kolom.",
    example: 'COUNT([debit])',
    arity: { min: 1, max: 1 },
    evaluate: null,
  },
  {
    name: "SUMIF",
    category: "aggregation",
    signature: 'SUMIF([kolom_kondisi], "nilai", [kolom_jumlah])',
    description: "Total nilai dari kolom_jumlah, hanya untuk baris yang kolom_kondisi-nya sama dengan nilai.",
    example: 'SUMIF([kategori], "OMZET", [debit])',
    arity: { min: 3, max: 3 },
    evaluate: null,
  },
  {
    name: "COUNTIF",
    category: "aggregation",
    signature: 'COUNTIF([kolom], "nilai")',
    description: "Hitung berapa baris yang nilai kolom-nya sama dengan nilai.",
    example: 'COUNTIF([kategori], "BIAYA")',
    arity: { min: 2, max: 2 },
    evaluate: null,
  },
  {
    name: "AVERAGEIF",
    category: "aggregation",
    signature: 'AVERAGEIF([kolom_kondisi], "nilai", [kolom_rata])',
    description: "Rata-rata nilai dari kolom_rata, hanya untuk baris yang cocok dengan nilai.",
    example: 'AVERAGEIF([kategori], "OMZET", [debit])',
    arity: { min: 3, max: 3 },
    evaluate: null,
  },

  // ─── Reference (handled by dedicated AST nodes — listed for catalog) ────
  {
    name: "PREV",
    category: "reference",
    signature: "PREV([nama_rumus])",
    description: "Nilai rumus pada baris sebelumnya. Pada baris pertama bernilai 0.",
    example: 'PREV([saldo]) + [debit] - [kredit]',
    arity: { min: 1, max: 1 },
    evaluate: null,
  },
  {
    name: "ROW",
    category: "reference",
    signature: "ROW()",
    description: "Nomor baris (mulai dari 2 mengikuti konvensi spreadsheet).",
    example: 'IF(ROW() == 2, [debit], PREV([saldo]) + [debit])',
    arity: { min: 0, max: 0 },
    evaluate: null,
  },
];

/** Spreadsheet-style truthiness used by IFS evaluator. */
function isTruthy(v: Value): boolean {
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return Boolean(v);
}

/** Lookup map by canonical UPPERCASE name. Built once at module load. */
export const FUNCTION_BY_NAME: Record<string, FunctionDef> = (() => {
  const out: Record<string, FunctionDef> = {};
  for (const f of FUNCTION_LIBRARY) out[f.name] = f;
  return out;
})();

/** Set of function names handled by dedicated AST nodes (legacy + reference). */
export const DEDICATED_NODE_FUNCTIONS = new Set([
  "IF",
  "PREV",
  "ROW",
  "SEARCH",
  "ISERROR",
  "NOT",
  "AND",
  "OR",
]);

/** Set of aggregation function names handled by the aggregation pass. */
export const AGGREGATION_FUNCTIONS = new Set([
  "SUM",
  "AVERAGE",
  "COUNT",
  "SUMIF",
  "COUNTIF",
  "AVERAGEIF",
]);

void SearchNotFoundError; // imported for the registry types' benefit
