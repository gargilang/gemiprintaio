"use client";

/**
 * ExpressionAssistant — textual editor for the cashbook formula DSL.
 *
 * Syntax (AppSheet-style):
 *   [kolom]       → kolom input atau formula key
 *   FUNGSI(...)   → fungsi bawaan (IF, PREV, SEARCH, ISERROR, NOT, AND, OR, ROW)
 *   "teks"        → string literal
 *   angka         → numeric literal
 *   ? :           → ternary (prints as IF)
 *   && ||         → AND/OR alias
 *
 * Features:
 *   - Syntax highlighting via backdrop technique (no Monaco/CodeMirror).
 *   - Live parse debounced 250 ms with inline diagnostics.
 *   - Autocomplete: [ triggers column/formula list, uppercase triggers function list.
 *   - Test button evaluates against 4 sample rows.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  parseDsl,
  astToDsl,
  DEFAULT_INPUT_COLUMNS,
  evaluateDataset,
  normalizeAstColumns,
  tokenize,
  FUNCTION_LIBRARY,
  type FunctionDef,
  type FunctionCategory,
  type SymbolContext,
  type ParseDiagnostic,
} from "@/lib/ast";
import type { ASTNode, FormulaDefinition, FormulaGroup } from "@/lib/ast/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface SchemaColumn {
  name: string;
  column: "C" | "D" | "E" | "F";
  label: string;
  description: string;
}

interface SchemaFormulaKey {
  key: string;
  label: string;
  group: FormulaGroup;
  isSystem: boolean;
  actorId: string | null;
}

interface SchemaHelper {
  signature: string;
  description: string;
}

interface SchemaCategory {
  code: string;
  label: string;
}

interface FormulaSchemaResponse {
  inputColumns: SchemaColumn[];
  formulaKeys: SchemaFormulaKey[];
  helpers: SchemaHelper[];
  /** Optional legacy letter → formula_key map (e.g. "J" → "saldo"). */
  columnLetterMap?: Record<string, string>;
  /** Active transaction categories (e.g. OMZET, BIAYA). */
  categories?: SchemaCategory[];
}

export interface ExpressionAssistantProps {
  title: string;
  initialAst: ASTNode;
  selfFormulaKey?: string | null;
  schemaOverride?: FormulaSchemaResponse | null;
  onSave: (ast: ASTNode, dsl: string) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  /**
   * The canonical default AST for this formula (from defaults.ts).
   * When provided and the current AST differs from it, a "Reset ke default"
   * button appears so the user can restore the factory formula.
   */
  defaultAst?: ASTNode | null;
}

type SuggestionKind = "column" | "formula" | "helper" | "category";

interface Suggestion {
  insert: string;
  label: string;
  hint: string;
  kind: SuggestionKind;
}

// ── Sample rows for test runner ───────────────────────────────────────────────

const SAMPLE_ROWS: Array<{ C: string; D: number; E: number; F: string }> = [
  { C: "OMZET",  D: 1_500_000, E: 0,       F: "Penjualan tunai" },
  { C: "BIAYA",  D: 0,         E: 250_000,  F: "Listrik" },
  { C: "SUPPLY", D: 0,         E: 400_000,  F: "Tinta cetak" },
  { C: "OMZET",  D: 800_000,   E: 0,        F: "Penjualan tunai" },
];

// ── Syntax highlighting ───────────────────────────────────────────────────────

/**
 * Convert DSL source to HTML with syntax-coloured spans.
 * Uses the tokenizer only — no full parse needed.
 *
 * Colour scheme:
 *   [kolom]   → emerald (green)
 *   FUNGSI(   → violet (purple)
 *   "string"  → amber (orange)
 *   number    → blue
 *   operator  → slate-400 (grey)
 *   other     → slate-800 (default)
 */
function highlightDsl(src: string): string {
  if (!src) return "";
  const { tokens } = tokenize(src);

  // Build a map of start → token for fast lookup
  const byStart = new Map(tokens.map((t) => [t.start, t]));

  let html = "";
  let i = 0;

  while (i < src.length) {
    const tok = byStart.get(i);
    if (!tok || tok.kind === "eof") {
      // Whitespace or unrecognised char — emit as-is (escaped)
      html += escHtml(src[i]);
      i += 1;
      continue;
    }

    const raw = src.slice(tok.start, tok.end);

    switch (tok.kind) {
      case "lbracket": {
        // Consume [ident] as one coloured unit if possible
        const next = tokens[tokens.indexOf(tok) + 1];
        const close = tokens[tokens.indexOf(tok) + 2];
        if (
          next &&
          next.kind === "ident" &&
          close &&
          close.kind === "rbracket"
        ) {
          const inner = src.slice(tok.start, close.end);
          html += `<span class="text-emerald-600 font-semibold">${escHtml(inner)}</span>`;
          i = close.end;
        } else {
          html += escHtml(raw);
          i = tok.end;
        }
        break;
      }
      case "rbracket":
        // Already consumed above; emit raw if we reach here
        html += escHtml(raw);
        i = tok.end;
        break;
      case "ident": {
        // Check if followed by "(" → function call
        const nextTok = tokens[tokens.indexOf(tok) + 1];
        if (nextTok && nextTok.kind === "lparen") {
          html += `<span class="text-violet-600 font-semibold">${escHtml(raw)}</span>`;
        } else {
          html += escHtml(raw);
        }
        i = tok.end;
        break;
      }
      case "string":
        html += `<span class="text-amber-600">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "number":
        html += `<span class="text-blue-600">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "boolean":
        html += `<span class="text-blue-500 italic">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      case "plus":
      case "minus":
      case "star":
      case "slash":
      case "eq":
      case "neq":
      case "gt":
      case "lt":
      case "gte":
      case "lte":
      case "andand":
      case "oror":
      case "bang":
      case "qmark":
      case "colon":
        html += `<span class="text-slate-400">${escHtml(raw)}</span>`;
        i = tok.end;
        break;
      default:
        html += escHtml(raw);
        i = tok.end;
        break;
    }
  }

  // Preserve trailing newline so backdrop height matches textarea
  if (src.endsWith("\n")) html += " ";
  return html;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
  // Note: regular spaces are intentionally kept as-is so the backdrop
  // wraps long formulas at word boundaries. `whiteSpace: pre-wrap` on
  // the container preserves consecutive spaces without needing &nbsp;.
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Tutorial panel ────────────────────────────────────────────────────────────

/**
 * Reference panel that replaces the formula explanation. Two modes:
 *
 *   1. "Tulis sendiri" — sintaks cheatsheet untuk user yang menulis rumus
 *      langsung di textarea.
 *   2. "Pakai AI" — template prompt yang sudah berisi konteks DSL kita.
 *      User bisa salin ke ChatGPT / Claude / dll, paste hasilnya kembali
 *      ke textarea. Kalau hasilnya invalid, parser kita akan flag dengan
 *      diagnostic biasa.
 *
 * Kedua mode tampil sebagai tab horizontal, default ke "Tulis sendiri".
 */
function TutorialPanel({ schema }: { schema: FormulaSchemaResponse | null }) {
  const [mode, setMode] = useState<"manual" | "ai" | "library">("manual");
  const [copied, setCopied] = useState(false);

  // Build the AI prompt template using the live schema so the LLM sees
  // exactly which columns, formula keys, and categories are available.
  const aiPrompt = useMemo(() => buildAiPrompt(schema), [schema]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked — leave the textarea so user can copy manually.
    }
  }

  const tabs: Array<{ id: typeof mode; label: string }> = [
    { id: "manual", label: "Bantuan Syntax" },
    { id: "ai", label: "Bantuan AI" },
    { id: "library", label: "Pustaka Rumus" },
  ];

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              mode === t.id
                ? "border-slate-700 text-slate-800"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "manual" && <ManualCheatsheet />}
      {mode === "ai" && (
        <AiPromptCard
          prompt={aiPrompt}
          copied={copied}
          onCopy={copyPrompt}
        />
      )}
      {mode === "library" && <FunctionLibraryCatalog />}
    </div>
  );
}

/** Compact cheatsheet for hand-written formulas. */
function ManualCheatsheet() {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-xs text-slate-700 space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <code className="font-mono bg-white border border-slate-200 px-1 rounded text-emerald-700">[nama]</code>{" "}
          kolom atau rumus
        </span>
        <span>
          <code className="font-mono bg-white border border-slate-200 px-1 rounded text-violet-700">FUNGSI(...)</code>{" "}
          fungsi bawaan
        </span>
        <span>
          <code className="font-mono bg-white border border-slate-200 px-1 rounded text-amber-700">&quot;TEKS&quot;</code>{" "}
          kategori atau teks
        </span>
        <span>
          <code className="font-mono bg-white border border-slate-200 px-1 rounded text-blue-600">123</code>{" "}
          angka
        </span>
      </div>
      <p className="text-slate-500 leading-relaxed">
        Ketik <code className="font-mono">[</code> untuk autocomplete kolom,
        huruf besar untuk fungsi, atau ketik nama biasa untuk saran campuran.
        Daftar lengkap fungsi yang tersedia ada di tab{" "}
        <strong>Pustaka Rumus</strong>.
      </p>
    </div>
  );
}

/** AI prompt template card with a copy-to-clipboard button. */
function AiPromptCard({
  prompt,
  copied,
  onCopy,
}: {
  prompt: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-600 leading-relaxed">
          Salin teks di bawah ke ChatGPT, Claude, atau AI lain. Tambahkan
          permintaan kamu di bagian akhir, mis.{" "}
          <em>&quot;Buat rumus bonus 5% dari omzet untuk Andi.&quot;</em> Tempel
          jawaban AI ke kolom rumus di atas. Kalau formatnya salah, sistem
          akan menampilkan saran perbaikan otomatis.
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 px-2 py-1 text-[11px] rounded border border-slate-300 bg-white hover:bg-slate-100 font-semibold"
        >
          {copied ? "Tersalin!" : "Salin"}
        </button>
      </div>
      <pre className="font-mono text-[11px] text-slate-700 bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
        {prompt}
      </pre>
    </div>
  );
}

/**
 * Pustaka Rumus — function library catalog. Lists every function from
 * FUNCTION_LIBRARY grouped by category, with signature, description, and
 * example. The signature is clickable to copy to clipboard.
 */
function FunctionLibraryCatalog() {
  const [filter, setFilter] = useState("");
  const [copiedFn, setCopiedFn] = useState<string | null>(null);

  // Group by category, in display order.
  const grouped = useMemo(() => {
    const order: FunctionCategory[] = [
      "logic",
      "math",
      "text",
      "date",
      "aggregation",
      "reference",
    ];
    const out = new Map<FunctionCategory, FunctionDef[]>();
    for (const cat of order) out.set(cat, []);
    for (const f of FUNCTION_LIBRARY) {
      if (!out.has(f.category)) out.set(f.category, []);
      out.get(f.category)!.push(f);
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, []);

  const lower = filter.trim().toLowerCase();

  async function copySignature(fn: FunctionDef) {
    try {
      await navigator.clipboard.writeText(fn.signature);
      setCopiedFn(fn.name);
      setTimeout(() => setCopiedFn(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {FUNCTION_LIBRARY.length} fungsi tersedia. Klik nama fungsi untuk
          menyalin signature ke clipboard.
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari fungsi…"
          className="text-xs px-2 py-1 border border-slate-300 rounded w-40"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-3">
        {Array.from(grouped.entries()).map(([cat, fns]) => {
          const visible = fns.filter(
            (f) =>
              !lower ||
              f.name.toLowerCase().includes(lower) ||
              f.description.toLowerCase().includes(lower) ||
              f.signature.toLowerCase().includes(lower)
          );
          if (visible.length === 0) return null;
          return (
            <section key={cat}>
              <h6 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                {CATEGORY_LABEL[cat]}
              </h6>
              <ul className="space-y-1">
                {visible.map((fn) => (
                  <li
                    key={fn.name}
                    className="bg-white border border-slate-200 rounded px-2 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => copySignature(fn)}
                        className="font-mono text-[11px] text-violet-700 font-semibold hover:underline cursor-pointer text-left break-all"
                        title="Salin signature"
                      >
                        {fn.signature}
                      </button>
                      {copiedFn === fn.name && (
                        <span className="text-[10px] text-emerald-600 shrink-0">
                          Tersalin
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      {fn.description}
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 break-all">
                      Contoh: {fn.example}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {Array.from(grouped.values()).every(
          (list) =>
            list.filter(
              (f) =>
                !lower ||
                f.name.toLowerCase().includes(lower) ||
                f.description.toLowerCase().includes(lower) ||
                f.signature.toLowerCase().includes(lower)
            ).length === 0
        ) && (
          <p className="text-xs text-slate-400 italic text-center py-4">
            Tidak ada fungsi yang cocok dengan &quot;{filter}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<FunctionCategory, string> = {
  logic: "Logika",
  math: "Matematika",
  text: "Teks",
  date: "Tanggal & Waktu",
  aggregation: "Agregasi",
  reference: "Referensi & Baris",
};

/**
 * Build the AI prompt template from the live schema. We list every
 * available column, formula key, and category so the LLM can produce
 * formulas that reference real names.
 */
function buildAiPrompt(schema: FormulaSchemaResponse | null): string {
  if (!schema) return "Memuat skema rumus…";

  const columns = schema.inputColumns
    .map((c) => `  - [${c.name}] = ${c.label} (${c.description})`)
    .join("\n");

  const formulas = schema.formulaKeys
    .map((f) => `  - [${f.key}] = ${f.label}`)
    .join("\n");

  const categories = (schema.categories ?? [])
    .map((c) => `  - "${c.code}" = ${c.label}`)
    .join("\n");

  return [
    "Saya butuh rumus untuk halaman keuangan. DSL yang saya pakai mirip Excel,",
    "dengan format ketat:",
    "",
    "Sintaks dasar:",
    "  [nama]      → referensi kolom transaksi atau rumus lain",
    "  FUNGSI(...) → fungsi bawaan, selalu HURUF BESAR",
    '  "teks"      → string literal (mis. kategori transaksi)',
    "  Operator    → + - * /  == !=  > < >= <=  ?:  && ||",
    "",
    "Aplikasi punya pustaka fungsi yang lengkap (math, text, date, agregasi).",
    "Beberapa yang sering dipakai:",
    "  IF(cond, lalu, kalauTidak), IFS(c1, h1, c2, h2, ...)",
    "  PREV([rumus])      → nilai rumus baris sebelumnya (untuk akumulasi)",
    "  ROW()              → nomor baris (mulai dari 2)",
    '  SEARCH("teks", [kolom]), ISERROR(x), NOT, AND, OR',
    "  ABS, ROUND, ROUNDUP, ROUNDDOWN, CEILING, FLOOR, MOD, POWER, MIN, MAX",
    "  LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, CONCAT",
    "  YEAR, MONTH, DAY, EDATE, EOMONTH, DATEDIF, TODAY",
    "  SUM, AVERAGE, COUNT, SUMIF, COUNTIF, AVERAGEIF",
    "Daftar lengkap signature dan contoh ada di tab Pustaka Rumus.",
    "",
    "Kolom transaksi yang tersedia:",
    columns || "  (belum ada)",
    "",
    "Kolom kalkulasi (rumus) yang tersedia:",
    formulas || "  (belum ada)",
    "",
    "Kategori transaksi yang biasa dipakai:",
    categories || "  (belum ada)",
    "",
    "Aturan penting:",
    "  1. Selalu pakai [namakolom] atau [namarumus] untuk referensi.",
    "  2. Fungsi selalu HURUF BESAR.",
    '  3. Kategori transaksi ditulis sebagai string literal, mis. "OMZET".',
    "  4. PREV(...) hanya menerima referensi rumus dalam kurung siku.",
    "  5. Output cukup rumusnya saja, jangan tambah komentar atau penjelasan.",
    "",
    "Contoh:",
    "  Bonus 5% omzet → [omzet] * 0.05",
    "  Saldo berjalan → IF(ROW() == 2, [debit] - [kredit], PREV([saldo]) + [debit] - [kredit])",
    '  Total omzet bulanan → SUMIF([kategori], "OMZET", [debit])',
    "  Selisih hari → DATEDIF([tanggal], TODAY(), \"D\")",
    "",
    "Sekarang buatkan saya rumus untuk: ",
  ].join("\n");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExpressionAssistant({
  title,
  initialAst,
  selfFormulaKey,
  schemaOverride,
  onSave,
  onCancel,
  saving = false,
  defaultAst = null,
}: ExpressionAssistantProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const [schema, setSchema] = useState<FormulaSchemaResponse | null>(
    schemaOverride ?? null
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("");
  const [debouncedSource, setDebouncedSource] = useState<string>("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testRows, setTestRows] = useState<Array<Record<string, unknown>> | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // ── Load schema ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (schemaOverride) { setSchema(schemaOverride); return; }
    let cancelled = false;
    fetch("/api/finance/formula-schema")
      .then((r) => r.json())
      .then((body: FormulaSchemaResponse | { error: string }) => {
        if (cancelled) return;
        if ("error" in body) { setSchemaError(body.error); return; }
        setSchema(body);
      })
      .catch((e) => { if (!cancelled) setSchemaError((e as Error).message); });
    return () => { cancelled = true; };
  }, [schemaOverride]);

  const ctx: SymbolContext = useMemo(() => {
    if (!schema) return { inputColumns: DEFAULT_INPUT_COLUMNS, formulaKeys: [] };
    const inputColumns: Record<string, "C" | "D" | "E" | "F"> = {};
    for (const c of schema.inputColumns) inputColumns[c.name] = c.column;
    return {
      inputColumns,
      // We keep self in formulaKeys because cumulative formulas legitimately
      // reference themselves via PREV([self]) — filtering it out would cause
      // every running-total formula (Saldo, Omzet, Laba Bersih) to flag its
      // own previous-row reference as "unknown identifier".
      formulaKeys: schema.formulaKeys.map((f) => f.key),
    };
  }, [schema]);

  // ── Initial DSL from AST ────────────────────────────────────────────────
  useEffect(() => {
    if (!schema) return;
    try {
      // Normalise AST so legacy column letters (e.g. "J") become semantic
      // formula keys (e.g. "saldo") before printing. Without this step the
      // textarea shows things like PREV([J]) instead of PREV([saldo]).
      const letterMap = schema.columnLetterMap ?? {};
      const normalised = normalizeAstColumns(initialAst, letterMap);
      const dsl = astToDsl(normalised, ctx);
      setSource(dsl);
      setDebouncedSource(dsl);
    } catch {
      setSource("");
      setDebouncedSource("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // ── Debounce parsing ────────────────────────────────────────────────────
  useEffect(() => {
    const h = setTimeout(() => setDebouncedSource(source), 250);
    return () => clearTimeout(h);
  }, [source]);

  const parseResult = useMemo(() => {
    if (!schema) return { ast: null, diagnostics: [] as ParseDiagnostic[] };
    return parseDsl(debouncedSource, ctx);
  }, [debouncedSource, ctx, schema]);

  const isValid = parseResult.ast !== null && parseResult.diagnostics.length === 0;

  // ── Auto-resize textarea to match content ────────────────────────────────
  // Without this, the textarea stays at rows={1} while the backdrop div
  // grows with wrapped content, causing the highlighted text to render
  // outside the textarea border.
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 40)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [source, autoResize]);

  // ── Sync backdrop scroll with textarea ──────────────────────────────────
  function syncScroll() {
    const ta = textareaRef.current;
    const bd = backdropRef.current;
    if (ta && bd) {
      bd.scrollTop = ta.scrollTop;
      bd.scrollLeft = ta.scrollLeft;
    }
  }

  // ── Autocomplete ────────────────────────────────────────────────────────
  const allSuggestions = useMemo<Suggestion[]>(() => {
    if (!schema) return [];
    const cols: Suggestion[] = schema.inputColumns.map((c) => ({
      insert: `[${c.name}]`,
      label: `[${c.name}]`,
      hint: c.label + (c.description ? ` — ${c.description}` : ""),
      kind: "column",
    }));
    const keys: Suggestion[] = schema.formulaKeys.map((f) => ({
      insert: `[${f.key}]`,
      label: `[${f.key}]`,
      hint: f.label,
      kind: "formula",
    }));
    const helpers: Suggestion[] = schema.helpers.map((h) => ({
      insert: h.signature.split("(")[0] + "(",
      label: h.signature,
      hint: h.description,
      kind: "helper",
    }));
    const cats: Suggestion[] = (schema.categories ?? []).map((c) => ({
      insert: `"${c.code}"`,
      label: `"${c.code}"`,
      hint: `Kategori: ${c.label}`,
      kind: "category",
    }));
    return [...cols, ...keys, ...helpers, ...cats];
  }, [schema]);

  /**
   * Detect the current "token" being typed for autocomplete:
   *   - After "[" → match column/formula names
   *   - Uppercase letter sequence → match function names
   *   - Otherwise (lowercase/mixed letters) → match columns + categories
   *     so typing "om" suggests both [omzet] and "OMZET".
   */
  const currentToken = useMemo(() => {
    const ta = textareaRef.current;
    if (!ta) return null;
    const caret = ta.selectionStart ?? 0;
    const upTo = source.slice(0, caret);

    // Inside [...] — match after the [
    const bracketMatch = upTo.match(/\[([A-Za-z0-9_]*)$/);
    if (bracketMatch) {
      return {
        text: bracketMatch[1],
        start: caret - bracketMatch[1].length,
        end: caret,
        mode: "bracket" as const,
      };
    }

    // Uppercase function name (≥2 chars to avoid hijacking the bare-letter mode)
    const fnMatch = upTo.match(/[A-Z][A-Z0-9_]+$/);
    if (fnMatch) {
      return {
        text: fnMatch[0],
        start: caret - fnMatch[0].length,
        end: caret,
        mode: "fn" as const,
      };
    }

    // Bare letters in free position — only when not preceded by an open
    // string quote (we don't want to autocomplete inside a half-typed
    // string literal).
    const freeMatch = upTo.match(/(^|[^A-Za-z0-9_"])([A-Za-z][A-Za-z0-9_]*)$/);
    if (freeMatch) {
      // Count unescaped quotes before the match — odd count = inside string.
      const before = upTo.slice(0, caret - freeMatch[2].length);
      const quoteCount = (before.match(/"/g) ?? []).length;
      if (quoteCount % 2 === 0) {
        return {
          text: freeMatch[2],
          start: caret - freeMatch[2].length,
          end: caret,
          mode: "free" as const,
        };
      }
    }

    return null;
  }, [source]);

  const filteredSuggestions = useMemo(() => {
    if (!currentToken) return [];
    const prefix = currentToken.text.toLowerCase();
    if (currentToken.mode === "bracket") {
      // Inside [...]: kolom + formula keys only
      return allSuggestions
        .filter((s) => s.kind === "column" || s.kind === "formula")
        .filter((s) => {
          const bare = s.label.replace(/^\[|\]$/g, "").toLowerCase();
          return bare.startsWith(prefix);
        })
        .slice(0, 10);
    }
    if (currentToken.mode === "fn") {
      // Uppercase: helpers only
      return allSuggestions
        .filter((s) => s.kind === "helper")
        .filter((s) => s.label.toLowerCase().startsWith(prefix.toLowerCase()))
        .slice(0, 8);
    }
    // free: bare letters → kolom + formula + kategori (mixed)
    return allSuggestions
      .filter((s) => s.kind !== "helper")
      .filter((s) => {
        const bare = s.label.replace(/^[\["]|[\]"]$/g, "").toLowerCase();
        return bare.startsWith(prefix);
      })
      .slice(0, 10);
  }, [allSuggestions, currentToken]);

  useEffect(() => { setSuggestionIndex(0); }, [filteredSuggestions.length]);

  const acceptSuggestion = useCallback(
    (s: Suggestion) => {
      const ta = textareaRef.current;
      if (!ta || !currentToken) return;

      let insertText = s.insert;
      let replaceStart = currentToken.start;

      if (currentToken.mode === "bracket") {
        // Replace from the "[" character so we don't end up with "[[name]"
        replaceStart = currentToken.start - 1;
      }
      // For "free" mode: replace just the bare letters with whatever the
      // suggestion provides (`[omzet]` or `"OMZET"`). The "[" or '"' is
      // included in the insert text.

      const next =
        source.slice(0, replaceStart) +
        insertText +
        source.slice(currentToken.end);
      setSource(next);
      setSuggestionOpen(false);
      requestAnimationFrame(() => {
        const newCaret = replaceStart + insertText.length;
        ta.setSelectionRange(newCaret, newCaret);
        ta.focus();
      });
    },
    [currentToken, source]
  );

  // ── Keyboard handling ────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestionOpen && filteredSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestionIndex((i) => (i + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestionIndex((i) => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        acceptSuggestion(filteredSuggestions[suggestionIndex]);
        return;
      }
      if (e.key === "Escape") { setSuggestionOpen(false); return; }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setSource(e.target.value);
    setSuggestionOpen(true);
    syncScroll();
  }

  // ── Test runner ──────────────────────────────────────────────────────────
  async function runTest() {
    if (!parseResult.ast) return;
    setTesting(true);
    setTestError(null);
    setTestRows(null);
    try {
      const resp = await fetch("/api/cashbook-formula");
      const body = (await resp.json()) as { formulas: FormulaDefinition[] } | { error: string };
      let saved: Array<{ column: string; ast: ASTNode }> = [];
      if ("formulas" in body) {
        saved = body.formulas
          .filter((f) => f.enabled && f.id !== selfFormulaKey)
          .map((f) => ({ column: f.column, ast: f.ast }));
      }
      const outputs = evaluateDataset(SAMPLE_ROWS, [
        ...saved,
        { column: "__assistant_test__", ast: parseResult.ast },
      ]);
      setTestRows(outputs);
    } catch (e) {
      try {
        const outputs = evaluateDataset(SAMPLE_ROWS, [
          { column: "__assistant_test__", ast: parseResult.ast },
        ]);
        setTestRows(outputs);
        setTestError(`Hanya rumus baru yang dijalankan. (${(e as Error).message})`);
      } catch (fe) {
        setTestError((fe as Error).message);
      }
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!isValid || !parseResult.ast) return;
    await onSave(parseResult.ast, source);
  }

  // ── Reset to default ────────────────────────────────────────────────────
  // Compare current AST with defaultAst to decide whether to show the
  // "Reset ke default" button. We compare via JSON so structural equality
  // is checked, not reference equality.
  const isModifiedFromDefault = useMemo(() => {
    if (!defaultAst || !schema) return false;
    try {
      const { normalizeAstColumns } =
        require("@/lib/ast/normalize") as typeof import("@/lib/ast/normalize");
      const letterMap = schema.columnLetterMap ?? {};
      const normDefault = normalizeAstColumns(defaultAst, letterMap);
      const normCurrent = parseResult.ast
        ? normalizeAstColumns(parseResult.ast, letterMap)
        : null;
      return JSON.stringify(normDefault) !== JSON.stringify(normCurrent);
    } catch {
      return false;
    }
  }, [defaultAst, parseResult.ast, schema]);

  function handleResetToDefault() {
    if (!defaultAst || !schema) return;
    try {
      const { normalizeAstColumns } =
        require("@/lib/ast/normalize") as typeof import("@/lib/ast/normalize");
      const letterMap = schema.columnLetterMap ?? {};
      const normalised = normalizeAstColumns(defaultAst, letterMap);
      const dsl = astToDsl(normalised, ctx);
      setSource(dsl);
      setDebouncedSource(dsl);
    } catch {
      // ignore
    }
  }

  // ── Highlighted HTML (memoised) ──────────────────────────────────────────
  const highlightedHtml = useMemo(() => highlightDsl(source), [source]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (schemaError && !schema) {
    return (
      <div className="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded">
        Gagal memuat skema rumus: {schemaError}
      </div>
    );
  }
  if (!schema) {
    return <div className="p-4 text-sm text-slate-500">Memuat skema rumus…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Rumus untuk kolom
            </p>
            <h3 className="text-base font-semibold text-slate-900 truncate">{title}</h3>
          </div>
          <span
            aria-live="polite"
            className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
              isValid
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isValid ? "bg-emerald-500" : "bg-rose-500"}`} />
            {isValid ? "Valid" : "Belum valid"}
          </span>
        </div>
      </div>

      {/* Editor with syntax highlighting backdrop */}
      <div className="relative px-4 pt-3">
        {/*
          Backdrop: absolutely positioned div with identical font/padding/size.
          Contains coloured HTML. Pointer events disabled so clicks go to textarea.
        */}
        <div
          ref={backdropRef}
          aria-hidden
          className="absolute left-4 right-4 top-3 font-mono text-sm border border-transparent rounded-md px-3 py-2 overflow-hidden pointer-events-none select-none"
          style={{
            // Must match textarea exactly
            lineHeight: "1.5rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            // 1 baris + padding 2 × 0.5rem ≈ 2.5rem
            minHeight: "2.5rem",
          }}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />

        {/* Textarea — transparent text so backdrop shows through */}
        <textarea
          ref={textareaRef}
          value={source}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          onBlur={() => setTimeout(() => setSuggestionOpen(false), 120)}
          onFocus={() => setSuggestionOpen(true)}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          rows={1}
          placeholder='Contoh: [kategori] == "OMZET" ? PREV([omzet]) + [debit] : PREV([omzet])'
          className="relative w-full font-mono text-sm border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          style={{
            color: "transparent",
            caretColor: "#1e293b",
            lineHeight: "1.5rem",
            background: "transparent",
            // Drag handle muncul di pojok kanan-bawah; user bisa tarik vertikal
            // untuk memperbesar textarea kalau rumusnya panjang.
            resize: "vertical",
            minHeight: "2.5rem",
          }}
        />

        {/* Autocomplete popup */}
        {suggestionOpen && filteredSuggestions.length > 0 && (
          <ul className="absolute left-4 right-4 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-300 rounded-md shadow-lg text-sm z-10">
            {filteredSuggestions.map((s, idx) => (
              <li
                key={s.label}
                className={`flex items-baseline gap-2 px-3 py-1.5 cursor-pointer ${
                  idx === suggestionIndex ? "bg-blue-50" : "hover:bg-slate-50"
                }`}
                onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s); }}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide w-12 shrink-0 ${
                    s.kind === "column" || s.kind === "formula"
                      ? "text-emerald-600"
                      : s.kind === "category"
                        ? "text-amber-600"
                        : "text-violet-600"
                  }`}
                >
                  {s.kind === "column"
                    ? "Kolom"
                    : s.kind === "formula"
                      ? "Rumus"
                      : s.kind === "category"
                        ? "Kategori"
                        : "Fungsi"}
                </span>
                <span className="font-mono text-slate-800">{s.label}</span>
                <span className="text-xs text-slate-500 truncate">{s.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tutorial panel — quick reference & AI prompt template */}
      <div className="px-4 pt-3">
        <TutorialPanel schema={schema} />
      </div>

      {/* Diagnostics — hide when there are none, since TutorialPanel covers tips */}
      {parseResult.diagnostics.length > 0 && (
        <div className="px-4 pt-2">
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {parseResult.diagnostics.map((d, idx) => (
              <li
                key={idx}
                className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 break-words"
              >
                <span className="font-mono mr-2">[{d.start}:{d.end}]</span>
                {d.message}
                {d.hint && <span className="text-rose-600 ml-1">— {d.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Test output */}
      {testRows && testRows.length > 0 && (
        <div className="px-4 pt-3">
          <p className="text-xs font-semibold text-slate-600 mb-1">Hasil uji 4 baris contoh:</p>
          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="text-xs min-w-full">
              <thead className="bg-slate-50 text-slate-600 uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Kategori</th>
                  <th className="px-2 py-1 text-right">Debit</th>
                  <th className="px-2 py-1 text-right">Kredit</th>
                  <th className="px-2 py-1 text-right">Hasil rumus</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {testRows.map((row, idx) => {
                  const sample = SAMPLE_ROWS[idx];
                  const v = row.__assistant_test__;
                  return (
                    <tr key={idx}>
                      <td className="px-2 py-1 text-slate-500">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono">{sample?.C ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono">{sample?.D.toLocaleString("id-ID") ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono">{sample?.E.toLocaleString("id-ID") ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono">
                        {typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {testError && <p className="text-xs text-amber-700 mt-1">{testError}</p>}
        </div>
      )}

      <div className="grow" />

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={!isValid || testing}
            className="px-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {testing ? "Menguji…" : "Uji rumus"}
          </button>
          {defaultAst && isModifiedFromDefault && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-3 py-1.5 text-xs rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              title="Kembalikan rumus ini ke setelan pabrikan"
            >
              ↺ Reset ke default
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
