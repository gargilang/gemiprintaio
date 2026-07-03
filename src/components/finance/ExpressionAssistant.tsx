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
  type SymbolContext,
  type ParseDiagnostic,
} from "@/lib/ast";
import type { ASTNode, FormulaDefinition } from "@/lib/ast/types";
import type { FormulaSchemaResponse } from "./expression/types";
import { highlightDsl } from "./expression/highlight";
import TutorialPanel from "./expression/TutorialPanel";

// ── Types ────────────────────────────────────────────────────────────────────


export interface ExpressionAssistantProps {
  title: string;
  initialAst: ASTNode;
  selfFormulaKey?: string | null;
  schemaOverride?: FormulaSchemaResponse | null;
  onSave: (ast: ASTNode, dsl: string) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  /**
   * AST default kanonik untuk formula ini (dari defaults.ts).
   * Ketika diisi dan AST saat ini berbeda darinya, tombol "Kembali ke Bawaan"
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


// ── Component ─────────────────────────────────────────────────────────────────


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
    fetch("/api/keuangan/formula-schema")
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
      // Kita simpan diri sendiri di formulaKeys karena formula kumulatif legitimately
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
  // Tanpa ini, textarea akan diam di rows={1} sementara backdrop div
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
      label: c.label,
      hint: `kode: ${c.code}`,
      kind: "category",
    }));
    return [...cols, ...keys, ...helpers, ...cats];
  }, [schema]);

  /**
   * Deteksi "token" yang sedang diketik untuk autocomplete:
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

    // Nama fungsi UPPERCASE (≥2 karakter supaya tidak menabrak mode bare-letter)
    const fnMatch = upTo.match(/[A-Z][A-Z0-9_]+$/);
    if (fnMatch) {
      return {
        text: fnMatch[0],
        start: caret - fnMatch[0].length,
        end: caret,
        mode: "fn" as const,
      };
    }

    // Huruf telanjang di posisi bebas — hanya saat tidak didahului tanda kurung buka
    // string quote (we don't want to autocomplete inside a half-typed
    // string literal).
    const freeMatch = upTo.match(/(^|[^A-Za-z0-9_"])([A-Za-z][A-Za-z0-9_]*)$/);
    if (freeMatch) {
      // Hitung tanda kutip yang tidak di-escape sebelum match — jumlah ganjil = di dalam string.
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
        // Ganti dari karakter "[" supaya tidak berakhir dengan "[[name]"
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
  // Bandingkan AST saat ini dengan defaultAst untuk menentukan apakah
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
      <div className="p-4 text-base text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 rounded">
        Gagal memuat skema rumus: {schemaError}
      </div>
    );
  }
  if (!schema) {
    return <div className="p-4 text-base text-slate-500">Memuat skema rumus…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Rumus untuk kolom
            </p>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</h3>
          </div>
          <span
            aria-live="polite"
            className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-sm font-medium ${
              isValid
                ? "bg-emerald-50 dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-slate-700"
                : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50"
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
          className="absolute left-4 right-4 top-3 font-mono text-base border border-transparent rounded-md px-3 py-2.5 overflow-hidden pointer-events-none select-none"
          style={{
            // Harus persis match dengan textarea
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
          className="relative w-full font-mono text-base border border-slate-300 rounded-md px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:bg-slate-800 dark:text-slate-100"
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
          <ul className="absolute left-4 right-4 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-300 rounded-md shadow-lg text-base z-10">
            {filteredSuggestions.map((s, idx) => (
              <li
                key={s.label}
                className={`flex items-baseline gap-2 px-3 py-1.5 cursor-pointer ${
                  idx === suggestionIndex ? "bg-blue-50 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                }`}
                onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s); }}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide w-12 shrink-0 ${
                    s.kind === "column" || s.kind === "formula"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : s.kind === "category"
                        ? "text-amber-600 dark:text-amber-300"
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
                <span className={`font-mono text-slate-800 dark:text-slate-100 ${s.kind === "category" ? "font-sans" : ""}`}>{s.label}</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{s.hint}</span>
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
                className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 rounded px-2 py-1 break-words"
              >
                <span className="font-mono mr-2">[{d.start}:{d.end}]</span>
                {d.message}
                {d.hint && <span className="text-rose-600 dark:text-rose-400 ml-1">— {d.hint}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Test output */}
      {testRows && testRows.length > 0 && (
        <div className="px-4 pt-3">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-1">Hasil uji 4 baris contoh:</p>
          <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
            <table className="text-sm min-w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Kategori</th>
                  <th className="px-2 py-1 text-right">Debit</th>
                  <th className="px-2 py-1 text-right">Kredit</th>
                  <th className="px-2 py-1 text-right">Hasil rumus</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {testRows.map((row, idx) => {
                  const sample = SAMPLE_ROWS[idx];
                  const v = row.__assistant_test__;
                  return (
                    <tr key={idx}>
                      <td className="px-2 py-1 text-slate-500 dark:text-slate-400">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono text-slate-800 dark:text-slate-200">{sample?.C ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-800 dark:text-slate-200">{sample?.D.toLocaleString("id-ID") ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-800 dark:text-slate-200">{sample?.E.toLocaleString("id-ID") ?? ""}</td>
                      <td className="px-2 py-1 text-right font-mono text-slate-800 dark:text-slate-200">
                        {typeof v === "number" ? v.toLocaleString("id-ID") : String(v ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {testError && <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{testError}</p>}
        </div>
      )}

      <div className="grow" />

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runTest}
            disabled={!isValid || testing}
            className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {testing ? "Menguji…" : "Uji rumus"}
          </button>
          {defaultAst && isModifiedFromDefault && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-3 py-1.5 text-sm rounded border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-slate-800 text-amber-800 dark:text-amber-200 hover:bg-slate-50 dark:hover:bg-white/5"
              title="Kembalikan rumus ini ke setelan pabrikan"
            >
              ↺ Kembali ke Bawaan
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-base rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isValid || saving}
            className="px-4 py-1.5 text-base rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
