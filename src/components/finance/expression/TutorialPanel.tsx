"use client";

import { useMemo, useState } from "react";
import {
  FUNCTION_LIBRARY,
  type FunctionDef,
  type FunctionCategory,
} from "@/lib/ast";
import type { FormulaSchemaResponse } from "./types";

// Panel referensi (Bantuan Syntax / AI / Pustaka Rumus) untuk ExpressionAssistant.
// Diekstrak (Fase 6 B6) — presentational, tidak menyentuh editor/evaluator.

// ── Tutorial panel ────────────────────────────────────────────────────────────

/**
 * Panel referensi yang menggantikan penjelasan formula. Dua mode:
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
export default function TutorialPanel({ schema }: { schema: FormulaSchemaResponse | null }) {
  const [mode, setMode] = useState<"manual" | "ai" | "library">("manual");
  const [copied, setCopied] = useState(false);

  // Bangun template prompt AI memakai schema live supaya LLM melihat
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
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={`px-3 py-1.5 text-base font-semibold border-b-2 -mb-px transition-colors ${
              mode === t.id
                ? "border-slate-700 dark:border-slate-300 text-slate-800 dark:text-slate-100"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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

/** Cheatsheet ringkas untuk formula yang ditulis tangan. */
function ManualCheatsheet() {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-base text-slate-700 dark:text-slate-300 space-y-1.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <code className="font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 rounded text-emerald-700 dark:text-emerald-300">[nama]</code>{" "}
          kolom atau rumus
        </span>
        <span>
          <code className="font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 rounded text-violet-700 dark:text-violet-300">FUNGSI(...)</code>{" "}
          fungsi bawaan
        </span>
        <span>
          <code className="font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 rounded text-amber-700 dark:text-amber-300">&quot;TEKS&quot;</code>{" "}
          kategori atau teks
        </span>
        <span>
          <code className="font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1 rounded text-blue-600 dark:text-blue-300">123</code>{" "}
          angka
        </span>
      </div>
      <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
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
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          Salin teks di bawah ke ChatGPT, Claude, atau AI lain. Tambahkan
          permintaan kamu di bagian akhir, mis.{" "}
          <em>&quot;Buat rumus bonus 5% dari omzet untuk Andi.&quot;</em> Tempel
          jawaban AI ke kolom rumus di atas. Kalau formatnya salah, sistem
          akan menampilkan saran perbaikan otomatis.
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold"
        >
          {copied ? "Tersalin!" : "Salin"}
        </button>
      </div>
      <pre className="font-mono text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
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

  // Kelompokkan berdasarkan kategori, dalam display order.
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
    <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {FUNCTION_LIBRARY.length} fungsi tersedia. Klik nama fungsi untuk
          menyalin signature ke clipboard.
        </p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Cari fungsi…"
          className="text-base px-2 py-1 border border-slate-300 dark:border-slate-600 rounded w-40 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
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
              <h6 className="text-sm uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-1">
                {CATEGORY_LABEL[cat]}
              </h6>
              <ul className="space-y-1">
                {visible.map((fn) => (
                  <li
                    key={fn.name}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => copySignature(fn)}
                        className="font-mono text-sm text-violet-700 dark:text-violet-300 font-semibold hover:underline cursor-pointer text-left break-all"
                        title="Salin signature"
                      >
                        {fn.signature}
                      </button>
                      {copiedFn === fn.name && (
                        <span className="text-sm text-emerald-600 dark:text-emerald-300 shrink-0">
                          Tersalin
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                      {fn.description}
                    </p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 font-mono mt-0.5 break-all">
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
          <p className="text-base text-slate-400 dark:text-slate-500 italic text-center py-4">
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
 * Bangun template prompt AI dari schema live. Kita list setiap
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
