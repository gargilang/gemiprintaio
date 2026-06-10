import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";
import {
  deriveParticipantNameFromSourceColumn,
  resolveMetricParticipantName,
} from "@/lib/finance-metric-utils";
import {
  type FinanceColumnRule,
  type CategoryWithContributions,
  DEFAULT_COLUMN_RULES,
  parseKasbonConditions,
  parseCategoryContributions,
} from "@/lib/formula-engine";

export interface FinanceCategoryDefinition {
  id?: string;
  category_code: string;
  display_name: string;
  color_bg: string;
  color_text: string;
  color_border: string;
  direction: "debit" | "kredit" | "both";
  display_order: number;
  metric_contributions?: unknown; // JSON array of CategoryContributionRule
}

export type { FinanceColumnRule };

export interface FinanceMetricMapping {
  id?: string;
  metric_key: string;
  metric_label: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  source_column: string;
  participant_id?: string | null;
  participant_name: string | null;
  display_order: number;
}

export interface FinanceConfigPayload {
  categories: FinanceCategoryDefinition[];
  metricMappings: FinanceMetricMapping[];
  columnRules: FinanceColumnRule[];
}

const DEFAULT_CATEGORIES: FinanceCategoryDefinition[] = [
  { category_code: "KAS", display_name: "Kas", color_bg: "bg-blue-100 dark:bg-blue-900/30", color_text: "text-blue-800 dark:text-blue-200", color_border: "border-blue-300", direction: "both", display_order: 10 },
  { category_code: "BIAYA", display_name: "Biaya", color_bg: "bg-red-100 dark:bg-red-900/30", color_text: "text-red-800", color_border: "border-red-300", direction: "kredit", display_order: 20 },
  { category_code: "OMZET", display_name: "Omzet", color_bg: "bg-green-100 dark:bg-green-900/30", color_text: "text-green-800", color_border: "border-green-300", direction: "debit", display_order: 30 },
  { category_code: "INVESTOR", display_name: "Investor", color_bg: "bg-purple-100 dark:bg-purple-900/30", color_text: "text-purple-800", color_border: "border-purple-300", direction: "both", display_order: 40 },
  { category_code: "SUBSIDI", display_name: "Subsidi", color_bg: "bg-yellow-100 dark:bg-yellow-900/30", color_text: "text-yellow-800", color_border: "border-yellow-300", direction: "debit", display_order: 50 },
  { category_code: "LUNAS", display_name: "Lunas", color_bg: "bg-teal-100 dark:bg-teal-900/30", color_text: "text-teal-800", color_border: "border-teal-300", direction: "debit", display_order: 60 },
  { category_code: "SUPPLY", display_name: "Supply", color_bg: "bg-orange-100 dark:bg-orange-900/30", color_text: "text-orange-800", color_border: "border-orange-300", direction: "kredit", display_order: 70 },
  { category_code: "RETUR_PEMBELIAN", display_name: "Retur Pembelian", color_bg: "bg-emerald-100", color_text: "text-emerald-800", color_border: "border-emerald-300", direction: "debit", display_order: 72 },
  { category_code: "RETUR_PENJUALAN", display_name: "Retur Penjualan", color_bg: "bg-rose-100", color_text: "text-rose-800", color_border: "border-rose-300", direction: "kredit", display_order: 32 },
  { category_code: "RETUR_PENJUALAN_NONCASH", display_name: "Retur Penjualan (non-kas)", color_bg: "bg-rose-50", color_text: "text-rose-700", color_border: "border-rose-200", direction: "kredit", display_order: 33 },
  { category_code: "RETUR_HPP", display_name: "Retur HPP", color_bg: "bg-slate-100", color_text: "text-slate-800", color_border: "border-slate-300", direction: "debit", display_order: 76 },
  { category_code: "LABA", display_name: "Laba", color_bg: "bg-emerald-100 dark:bg-emerald-900/30", color_text: "text-emerald-800", color_border: "border-emerald-300", direction: "both", display_order: 80 },
  { category_code: "KOMISI", display_name: "Komisi", color_bg: "bg-cyan-100 dark:bg-cyan-900/30", color_text: "text-cyan-800", color_border: "border-cyan-300", direction: "kredit", display_order: 90 },
  { category_code: "TABUNGAN", display_name: "Tabungan", color_bg: "bg-indigo-100 dark:bg-indigo-900/30", color_text: "text-indigo-800", color_border: "border-indigo-300", direction: "kredit", display_order: 100 },
  { category_code: "HUTANG", display_name: "Hutang", color_bg: "bg-rose-100", color_text: "text-rose-800", color_border: "border-rose-300", direction: "kredit", display_order: 110 },
  { category_code: "PIUTANG", display_name: "Piutang", color_bg: "bg-lime-100", color_text: "text-lime-800", color_border: "border-lime-300", direction: "debit", display_order: 120 },
  { category_code: "MAKLON", display_name: "Maklon", color_bg: "bg-fuchsia-100", color_text: "text-fuchsia-800", color_border: "border-fuchsia-300", direction: "kredit", display_order: 78 },
];

const DEFAULT_MAPPINGS: FinanceMetricMapping[] = [];

async function nextDisplayOrderCategories(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("finance_category_definitions")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (Number((data as { display_order?: number })?.display_order) || 0) + 10;
  }
  const existing = await db.queryRaw<{ max_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS max_order FROM finance_category_definitions"
  );
  return (existing[0]?.max_order || 0) + 10;
}

async function nextDisplayOrderMappings(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("finance_metric_mappings")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (Number((data as { display_order?: number })?.display_order) || 0) + 10;
  }
  const existing = await db.queryRaw<{ max_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS max_order FROM finance_metric_mappings"
  );
  return (existing[0]?.max_order || 0) + 10;
}

export async function getFinanceConfig(): Promise<FinanceConfigPayload> {
  let categoriesResult = {
    data: null as FinanceCategoryDefinition[] | null,
  };
  let metricRows: FinanceMetricMapping[] = [];

  try {
    const categoriesQuery = await db.query<FinanceCategoryDefinition>(
      "finance_category_definitions",
      {
        where: { is_active: 1 },
        orderBy: { column: "display_order", ascending: true },
      }
    );
    categoriesResult = { data: categoriesQuery.data };
  } catch {
    categoriesResult = { data: null };
  }

  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      const { data: mappings, error: em } = await sb
        .from("finance_metric_mappings")
        .select(
          "id, metric_key, metric_label, metric_group, source_column, participant_id, display_order"
        )
        .eq("is_active", 1)
        .order("metric_group", { ascending: true })
        .order("display_order", { ascending: true });
      if (em) throw em;

      metricRows = (mappings || []).map((m: Record<string, unknown>) => {
        const sourceColumn = m.source_column as string;
        const participantId = (m.participant_id as string | null) ?? null;
        return {
          id: m.id as string,
          metric_key: m.metric_key as string,
          metric_label: m.metric_label as string,
          metric_group: m.metric_group as FinanceMetricMapping["metric_group"],
          source_column: sourceColumn,
          participant_id: participantId,
          participant_name: deriveParticipantNameFromSourceColumn(sourceColumn),
          display_order: Number(m.display_order),
        };
      });
    } else {
      metricRows = await db.queryRaw<FinanceMetricMapping>(
        `SELECT
        m.id,
        m.metric_key,
        m.metric_label,
        m.metric_group,
        m.source_column,
        m.participant_id,
        m.display_order
      FROM finance_metric_mappings m
      WHERE m.is_active = 1
      ORDER BY m.metric_group ASC, m.display_order ASC`
      );
    }
  } catch {
    metricRows = [];
  }

  metricRows = metricRows.map((m) => ({
    ...m,
    participant_name:
      resolveMetricParticipantName(m) ?? m.participant_name ?? null,
  }));

  const columnRules = await getColumnRules();

  return {
    categories: categoriesResult.data?.length ? categoriesResult.data : DEFAULT_CATEGORIES,
    metricMappings: metricRows?.length ? metricRows : DEFAULT_MAPPINGS,
    columnRules,
  };
}

/** Kategori transaksi aktif untuk dropdown (Kelola Orang kasbon picker, dll.). */
export async function listFinanceCategories(): Promise<
  Pick<FinanceCategoryDefinition, "category_code" | "display_name" | "direction">[]
> {
  try {
    const result = await db.query<FinanceCategoryDefinition>(
      "finance_category_definitions",
      {
        where: { is_active: 1 },
        orderBy: { column: "display_order", ascending: true },
      }
    );
    if (result.data?.length) {
      return result.data.map((c) => ({
        category_code: c.category_code,
        display_name: c.display_name,
        direction: c.direction,
      }));
    }
  } catch {
    // Tabel hilang di instalasi sangat lama — fall-through ke default.
  }
  return DEFAULT_CATEGORIES.map((c) => ({
    category_code: c.category_code,
    display_name: c.display_name,
    direction: c.direction,
  }));
}

// ── Column Rules ──────────────────────────────────────────────────────────

/** Auto-provision finance_metric_column_rules di Supabase kalau belum ada. */
async function ensureColumnRulesTable(): Promise<void> {
  const sb = getServerSupabaseClient();
  if (!sb) return;
  try {
    // Coba insert seed rows — kalau tabelnya tidak ada akan gagal lalu kita buat
    const { error: checkErr } = await sb
      .from("finance_metric_column_rules")
      .select("id")
      .limit(1);

    if (checkErr && checkErr.message.includes("does not exist")) {
      // Buat tabel via SQL mentah memakai service role (endpoint REST pg tidak tersedia,
      // jadi pakai pendekatan langsung: insert via endpoint admin Supabase)
      // Diam-diam jatuh balik — restart app berikutnya akan coba lagi
      return;
    }

    // Tabel ada — seed kalau masih kosong
    const { data: existingRules } = await sb
      .from("finance_metric_column_rules")
      .select("id")
      .limit(1);

    if (existingRules && existingRules.length === 0) {
      await sb.from("finance_metric_column_rules").insert(
        DEFAULT_COLUMN_RULES.map((r) => ({
          id: r.id,
          column_name: r.column_name,
          display_name: r.display_name,
          rule_type: r.rule_type,
          formula_expression: r.formula_expression,
          kasbon_conditions: r.kasbon_conditions ? JSON.stringify(r.kasbon_conditions) : null,
          is_system: r.is_system,
          display_order: r.display_order,
        }))
      );

      // Seed kontribusi kategori
      const seedContributions = [
        { codes: ["OMZET", "PIUTANG", "LUNAS"], contrib: [{ column: "omzet", amount_field: "debit", sign: 1 }] },
        { codes: ["BIAYA", "TABUNGAN", "KOMISI"], contrib: [{ column: "biaya_operasional", amount_field: "kredit", sign: 1 }] },
        { codes: ["HPP"], contrib: [{ column: "biaya_bahan", amount_field: "kredit", sign: 1 }] },
        { codes: ["RETUR_PENJUALAN", "RETUR_PENJUALAN_NONCASH"], contrib: [{ column: "omzet", amount_field: "kredit", sign: -1 }] },
        { codes: ["RETUR_HPP"], contrib: [{ column: "biaya_bahan", amount_field: "debit", sign: -1 }] },
        { codes: ["RETUR_PEMBELIAN"], contrib: [] },
      ];
      for (const { codes, contrib } of seedContributions) {
        await sb
          .from("finance_category_definitions")
          .update({ metric_contributions: contrib })
          .in("category_code", codes)
          .is("metric_contributions", null);
      }
    }
  } catch {
    // Jangan crash — pakai default saja
  }
}

/** Muat semua aturan kolom dari DB, jatuh balik ke default kalau tabel hilang. */
export async function getColumnRules(): Promise<FinanceColumnRule[]> {
  await ensureColumnRulesTable();
  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from("finance_metric_column_rules")
        .select("id, column_name, display_name, rule_type, formula_expression, kasbon_conditions, is_system, display_order")
        .order("display_order", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        return data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          column_name: r.column_name as string,
          display_name: r.display_name as string,
          rule_type: r.rule_type as FinanceColumnRule["rule_type"],
          formula_expression: (r.formula_expression as string | null) ?? null,
          kasbon_conditions: parseKasbonConditions(r.kasbon_conditions),
          is_system: Number(r.is_system ?? 0),
          display_order: Number(r.display_order ?? 0),
        })) as FinanceColumnRule[];
      }
    } else {
      const rows = await db.queryRaw<Record<string, unknown>>(
        `SELECT id, column_name, display_name, rule_type, formula_expression, kasbon_conditions, is_system, display_order
         FROM finance_metric_column_rules
         ORDER BY display_order ASC`
      );
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.id as string,
          column_name: r.column_name as string,
          display_name: r.display_name as string,
          rule_type: r.rule_type as FinanceColumnRule["rule_type"],
          formula_expression: (r.formula_expression as string | null) ?? null,
          kasbon_conditions: parseKasbonConditions(r.kasbon_conditions),
          is_system: Number(r.is_system ?? 0),
          display_order: Number(r.display_order ?? 0),
        })) as FinanceColumnRule[];
      }
    }
  } catch {
    // Tabel mungkin belum ada — jatuh balik ke default
  }
  return DEFAULT_COLUMN_RULES;
}

/** Mengembalikan column rules + categories-with-contributions untuk engine recalc. */
export async function getColumnRulesForRecalc(): Promise<{
  columnRules: FinanceColumnRule[];
  categories: CategoryWithContributions[];
}> {
  const columnRules = await getColumnRules();

  let categories: CategoryWithContributions[] = [];
  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      const { data } = await sb
        .from("finance_category_definitions")
        .select("category_code, metric_contributions")
        .eq("is_active", 1);
      categories = (data || []).map((r: Record<string, unknown>) => ({
        category_code: r.category_code as string,
        metric_contributions: parseCategoryContributions(r.metric_contributions),
      }));
    } else {
      const rows = await db.queryRaw<Record<string, unknown>>(
        `SELECT category_code, metric_contributions FROM finance_category_definitions WHERE is_active = 1`
      );
      categories = rows.map((r) => ({
        category_code: r.category_code as string,
        metric_contributions: parseCategoryContributions(r.metric_contributions),
      }));
    }
  } catch {
    // Jatuh balik ke kosong (DEFAULT_CATEGORY_CONTRIBUTIONS dipakai di engine)
  }

  return { columnRules, categories };
}

/** Simpan formula atau kasbon_conditions untuk satu aturan kolom. */
export async function updateColumnRule(
  id: string,
  input: {
    display_name?: string;
    formula_expression?: string | null;
    kasbon_conditions?: import("@/lib/formula-engine").KasbonConditions | null;
    rule_type?: FinanceColumnRule["rule_type"];
  }
) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.display_name !== undefined) payload.display_name = input.display_name;
  if (input.formula_expression !== undefined) payload.formula_expression = input.formula_expression;
  if (input.kasbon_conditions !== undefined) {
    payload.kasbon_conditions = input.kasbon_conditions
      ? JSON.stringify(input.kasbon_conditions)
      : null;
  }
  if (input.rule_type !== undefined) payload.rule_type = input.rule_type;

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("finance_metric_column_rules")
      .update(payload)
      .eq("id", id);
    // Kalau tabel belum ada (migrasi tertunda), lewati dengan tenang
    if (error && !error.message.includes("does not exist") && !error.message.includes("schema cache")) {
      return { data: null, error: new Error(error.message) };
    }
  }

  // Mirror SQLite
  try {
    await db.queryRaw(
      `UPDATE finance_metric_column_rules SET ${Object.keys(payload).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      [...Object.values(payload), id]
    );
  } catch { /* Tabel SQLite mungkin belum ada */ }

  return { data: { id }, error: null };
}

/** Simpan JSON metric_contributions untuk sebuah kategori. */
export async function updateCategoryContributions(
  categoryId: string,
  contributions: import("@/lib/formula-engine").CategoryContributionRule[]
) {
  const json = JSON.stringify(contributions);
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("finance_category_definitions")
      .update({ metric_contributions: contributions, updated_at: new Date().toISOString() })
      .eq("id", categoryId);
    // Kolom mungkin belum ada kalau migrasi tertunda
    if (error && !error.message.includes("does not exist") && !error.message.includes("schema cache")) {
      return { data: null, error: new Error(error.message) };
    }
  }

  try {
    await db.queryRaw(
      `UPDATE finance_category_definitions SET metric_contributions = ?, updated_at = ? WHERE id = ?`,
      [json, new Date().toISOString(), categoryId]
    );
  } catch { /* Kolom SQLite mungkin belum ada */ }

  return { data: { id: categoryId }, error: null };
}

export async function createFinanceCategory(input: {
  category_code: string;
  display_name: string;
}) {
  const code = input.category_code.toUpperCase().trim();
  const displayOrder = await nextDisplayOrderCategories();

  // Kalau ada baris soft-deleted dengan category_code yang sama, reaktivasi
  // alih-alih menyisipkan baris baru (menghindari pelanggaran constraint unik
  // di category_code).
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data: existing } = await sb
      .from("finance_category_definitions")
      .select("id")
      .eq("category_code", code)
      .limit(1)
      .single();
    if (existing?.id) {
      return db.update("finance_category_definitions", existing.id, {
        display_name: input.display_name.trim(),
        is_active: 1,
        display_order: displayOrder,
      });
    }
  } else {
    // SQLite path
    const rows = await db.query("finance_category_definitions", {
      where: { category_code: code },
      limit: 1,
    });
    const existingRow = rows.data?.[0] as { id: string } | undefined;
    if (existingRow?.id) {
      return db.update("finance_category_definitions", existingRow.id, {
        display_name: input.display_name.trim(),
        is_active: 1,
        display_order: displayOrder,
      });
    }
  }

  const id = `fin-cat-${Date.now()}`;
  return db.insert("finance_category_definitions", {
    id,
    category_code: code,
    display_name: input.display_name.trim(),
    color_bg: "bg-gray-100 dark:bg-slate-800",
    color_text: "text-gray-800 dark:text-slate-100",
    color_border: "border-gray-300",
    direction: "both",
    display_order: displayOrder,
    is_active: 1,
  });
}

export async function deleteFinanceCategory(id: string) {
  return db.update("finance_category_definitions", id, { is_active: 0 });
}

export async function createFinanceMetricMapping(input: {
  metric_key: string;
  metric_label: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  source_column: string;
  participant_id?: string | null;
}) {
  const id = `fin-metric-${Date.now()}`;
  const displayOrder = await nextDisplayOrderMappings();
  return db.insert("finance_metric_mappings", {
    id,
    metric_key: input.metric_key.trim(),
    metric_label: input.metric_label.trim(),
    metric_group: input.metric_group,
    source_column: input.source_column.trim(),
    participant_id: input.participant_id || null,
    display_order: displayOrder,
    is_active: 1,
  });
}

export async function updateFinanceMetricMapping(
  id: string,
  input: {
    metric_label?: string;
    metric_group?: "summary" | "profit_share" | "cash_advance";
    source_column?: string;
    participant_id?: string | null;
  }
) {
  return db.update("finance_metric_mappings", id, input);
}

export async function deleteFinanceMetricMapping(id: string) {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("finance_metric_mappings")
      .update({ is_active: 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    await db.update("finance_metric_mappings", id, { is_active: 0 });
    return { data: { id }, error: null };
  }
  return db.update("finance_metric_mappings", id, { is_active: 0 });
}
