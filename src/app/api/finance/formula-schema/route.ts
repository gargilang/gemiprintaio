/**
 * GET /api/finance/formula-schema
 *
 * Returns the symbol table consumed by the Expression Assistant DSL —
 * input columns (kategori/debit/kredit/keperluan), every active formula
 * key (omzet, kasbon_andi, …), and a compact actor index used to render
 * "Bagi Hasil <Nama>" labels in the autocomplete popup.
 *
 * Output shape is intentionally cached-friendly (no per-request
 * computation) so the editor can call this on every focus / dropdown
 * trigger without thrashing the database.
 */

import { NextResponse } from "next/server";

import { listActiveFormulas } from "@/lib/services/cashbook-formula-service";
import { listBusinessActors } from "@/lib/services/business-actor-service";
import { listFinanceCategories } from "@/lib/services/finance-config-service";
import { resolveFormulaKey, type FormulaGroup } from "@/lib/ast/types";
import { DEFAULT_INPUT_COLUMNS } from "@/lib/ast/dsl-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface FormulaSchemaResponse {
  inputColumns: Array<{
    /** Identifier the user types in the DSL ("debit"). */
    name: string;
    /** Internal AST column letter ("D"). */
    column: "C" | "D" | "E" | "F";
    /** Indonesian label shown in the autocomplete popup. */
    label: string;
    /** One-line tooltip. */
    description: string;
  }>;
  formulaKeys: Array<{
    /** Stable semantic key used in the DSL ("omzet", "kasbon_andi"). */
    key: string;
    /** Friendly label in Bahasa ("Omzet", "Kasbon Andi"). */
    label: string;
    /** Group bucket for visual grouping in the popup. */
    group: FormulaGroup;
    /** Whether this formula is system-managed (not user-editable). */
    isSystem: boolean;
    /** Linked actor id, when the formula is per-person. */
    actorId: string | null;
  }>;
  helpers: Array<{
    /** Function call as the user types it: "if(cond, a, b)". */
    signature: string;
    /** Indonesian description for the popup. */
    description: string;
  }>;
  /**
   * Map of legacy column letter (G/H/I/J/K, P/Q/...) → semantic formula_key.
   *
   * Old AST blobs in the database may still store letters (e.g.
   * `prev("J")` for Saldo) instead of formula_keys. The Expression
   * Assistant uses this map to normalise them before printing so the
   * user always sees `[saldo]` rather than `[J]`.
   *
   * Keys include both the legacy letter and the formula_key itself
   * (self-mapped) so consumers can do a single dictionary lookup.
   */
  columnLetterMap: Record<string, string>;
  /**
   * Active transaction categories (mis. "OMZET", "BIAYA", "PIUTANG").
   *
   * Surfaced so the editor's autocomplete can suggest `"OMZET"` when
   * the user types `om`, since categories appear in formulas as
   * string literals (e.g. `[kategori] == "OMZET"`).
   */
  categories: Array<{
    /** Code as it appears in `[kategori]` comparisons. */
    code: string;
    /** Human-readable name for the popup hint. */
    label: string;
  }>;
}

const COLUMN_LABELS: Record<keyof typeof DEFAULT_INPUT_COLUMNS, string> = {
  kategori: "Kategori",
  debit: "Debit",
  kredit: "Kredit",
  keperluan: "Keperluan",
};

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  kategori: "Kode kategori transaksi (mis. OMZET, BIAYA).",
  debit: "Nominal masuk pada baris transaksi.",
  kredit: "Nominal keluar pada baris transaksi.",
  keperluan: "Catatan teks bebas pada baris transaksi.",
};

const HELPERS: FormulaSchemaResponse["helpers"] = [
  {
    signature: "IF(kondisi, lalu, kalauTidak)",
    description: "Pilih nilai sesuai kondisi. Sama dengan ternary kondisi ? a : b.",
  },
  {
    signature: "PREV([nama_rumus])",
    description: "Nilai rumus pada baris sebelumnya. Pada baris pertama bernilai 0.",
  },
  {
    signature: "ROW()",
    description: "Nomor baris (mulai dari 2 mengikuti konvensi spreadsheet).",
  },
  {
    signature: 'SEARCH("teks", [kolom])',
    description: "Cari substring di teks (case-insensitive). Lemparkan error jika tidak ada.",
  },
  {
    signature: "ISERROR(ekspresi)",
    description: "true kalau ekspresi melemparkan error. Biasanya membungkus SEARCH().",
  },
  {
    signature: "NOT(ekspresi)",
    description: "Negasi boolean.",
  },
  {
    signature: "AND(a, b)",
    description: "Kedua kondisi harus benar.",
  },
  {
    signature: "OR(a, b)",
    description: "Salah satu kondisi harus benar.",
  },
];

export async function GET() {
  try {
    const [formulas, actors, categories] = await Promise.all([
      listActiveFormulas(),
      listBusinessActors({ includeInactive: true }),
      listFinanceCategories(),
    ]);

    const actorById = new Map(actors.map((a) => [a.id, a]));

    const formulaKeys: FormulaSchemaResponse["formulaKeys"] = [];
    const columnLetterMap: Record<string, string> = {};
    const seen = new Set<string>();
    for (const f of formulas) {
      const key = resolveFormulaKey(f);
      if (!key) continue;
      // Build legacy letter → semantic key map (e.g. "J" → "saldo")
      // plus self-mapping so callers can use a single dictionary lookup.
      if (f.column && f.column !== key) columnLetterMap[f.column] = key;
      columnLetterMap[key] = key;
      if (seen.has(key)) continue;
      seen.add(key);
      formulaKeys.push({
        key,
        label: f.name,
        group: f.formulaGroup ?? "custom",
        isSystem: f.isSystem,
        actorId: f.actorId ?? null,
      });
    }

    const inputColumns: FormulaSchemaResponse["inputColumns"] = Object.entries(
      DEFAULT_INPUT_COLUMNS
    ).map(([name, column]) => ({
      name,
      column,
      label: COLUMN_LABELS[name as keyof typeof COLUMN_LABELS] ?? name,
      description: COLUMN_DESCRIPTIONS[name] ?? "",
    }));

    const body: FormulaSchemaResponse = {
      inputColumns,
      formulaKeys: formulaKeys.sort((a, b) => {
        // Group order matches the UI: summary first, then per-actor, then custom.
        const order: Record<FormulaGroup, number> = {
          summary: 0,
          profit_share: 1,
          cash_advance: 2,
          bonus: 3,
          custom: 4,
        };
        const ga = order[a.group] ?? 99;
        const gb = order[b.group] ?? 99;
        if (ga !== gb) return ga - gb;
        return a.label.localeCompare(b.label, "id");
      }),
      helpers: HELPERS,
      columnLetterMap,
      categories: categories
        .map((c) => ({ code: c.category_code, label: c.display_name }))
        .sort((a, b) => a.code.localeCompare(b.code, "id")),
    };

    void actorById; // Reserved for future per-actor enrichment.
    return NextResponse.json(body);
  } catch (error) {
    console.error("GET /api/finance/formula-schema error:", error);
    return NextResponse.json(
      { error: "Gagal memuat skema rumus" },
      { status: 500 }
    );
  }
}
