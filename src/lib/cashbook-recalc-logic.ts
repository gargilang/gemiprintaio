/**
 * Pure cashbook running-total logic (shared by SQLite + Supabase paths).
 *
 * Supports two modes:
 *   • Data-driven  — pass columnRules + categoryWithContributions from DB
 *   • Legacy/fallback — omit those params to use hardcoded default rules
 */

import {
  type ProfitSharePartnerRuntime,
  defaultProfitSharePartners,
} from "@/lib/profit-share-config";

import {
  type FinanceColumnRule,
  type CategoryWithContributions,
  type KasbonConditions,
  DEFAULT_COLUMN_RULES,
  DEFAULT_CATEGORY_CONTRIBUTIONS,
  evaluateFormula,
  parseKasbonConditions,
  parseCategoryContributions,
} from "@/lib/formula-engine";

export type { FinanceColumnRule, CategoryWithContributions };

export interface CashbookRecalcInputRow {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan?: string;
  catatan?: string;
  urutan_tampilan: number;
  dibuat_pada: string;
  diperbarui_pada?: string;
  diarsipkan_pada?: string | null;

  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  saldo: number;
  laba_bersih: number;
  kasbon_anwar: number;
  kasbon_suri: number;
  kasbon_cahaya: number;
  kasbon_dinil: number;
  bagi_hasil_anwar: number;
  bagi_hasil_suri: number;
  bagi_hasil_gemi: number;

  override_omzet?: number;
  override_biaya_operasional?: number;
  override_biaya_bahan?: number;
  override_saldo?: number;
  override_laba_bersih?: number;
  override_kasbon_anwar?: number;
  override_kasbon_suri?: number;
  override_kasbon_cahaya?: number;
  override_kasbon_dinil?: number;
  override_bagi_hasil_anwar?: number;
  override_bagi_hasil_suri?: number;
  override_bagi_hasil_gemi?: number;

  [key: string]: unknown;
}

function truthyOverride(v: unknown): boolean {
  return v === 1 || v === true;
}

function rowNum(row: CashbookRecalcInputRow, field: string): number {
  const v = row[field];
  return typeof v === "number" ? v : 0;
}

function overrideField(sourceColumn: string): string {
  return `override_${sourceColumn}`;
}

/**
 * Sort order for recalculation: oldest book row first (matches SQLite query).
 */
export function sortCashbookRowsForRecalc<T extends CashbookRecalcInputRow>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const uo = Number(a.urutan_tampilan) - Number(b.urutan_tampilan);
    if (uo !== 0) return uo;
    return String(a.dibuat_pada).localeCompare(String(b.dibuat_pada));
  });
}

/**
 * Build a lookup: category_code → CategoryContributionRule[] from DB categories.
 * Falls back to DEFAULT_CATEGORY_CONTRIBUTIONS for categories with no DB data.
 */
function buildContributionLookup(
  categories: CategoryWithContributions[]
): Record<string, Array<{ column: string; amount_field: "debit" | "kredit"; sign: 1 | -1 }>> {
  const lookup: Record<string, Array<{ column: string; amount_field: "debit" | "kredit"; sign: 1 | -1 }>> = {};
  // Seed with defaults first
  for (const [code, rules] of Object.entries(DEFAULT_CATEGORY_CONTRIBUTIONS)) {
    lookup[code] = rules;
  }
  // Override with DB values
  for (const cat of categories) {
    const contribs = parseCategoryContributions(cat.metric_contributions);
    if (contribs.length > 0) {
      lookup[cat.category_code] = contribs;
    } else if (cat.metric_contributions !== null && cat.metric_contributions !== undefined) {
      // Explicitly empty — user cleared contributions for this category
      lookup[cat.category_code] = [];
    }
  }
  return lookup;
}

/**
 * Returns per-row numeric fields to persist after full pass.
 *
 * @param sortedRows     Rows already sorted via sortCashbookRowsForRecalc
 * @param profitPartners Profit-share partner runtimes
 * @param columnRules    Optional data-driven column rules from DB (falls back to DEFAULT_COLUMN_RULES)
 * @param categories     Optional categories with contribution rules from DB
 */
export function computeCashbookRecalculationUpdates(
  sortedRows: CashbookRecalcInputRow[],
  profitPartners: ProfitSharePartnerRuntime[] = defaultProfitSharePartners(),
  columnRules?: FinanceColumnRule[],
  categories?: CategoryWithContributions[]
): Array<{ id: string; updates: Record<string, number> }> {
  const rules = columnRules ?? DEFAULT_COLUMN_RULES;
  const contributionLookup = buildContributionLookup(categories ?? []);

  // Separate rules by type for efficient per-row processing
  const accumulatorRules = rules.filter((r) => r.rule_type === "accumulator");
  const kasbonRules = rules.filter((r) => r.rule_type === "kasbon_conditional");
  const formulaRules = rules.filter((r) => r.rule_type === "formula");
  // profit_share and saldo handled inline

  const out: Array<{ id: string; updates: Record<string, number> }> = [];

  // Running totals keyed by column_name
  const running: Record<string, number> = {};

  // Initialise all column running totals to 0
  for (const rule of rules) {
    running[rule.column_name] = 0;
  }
  for (const partner of profitPartners) {
    running[partner.sourceColumn] = 0;
  }

  let prevLabaBersih = 0;

  for (const row of sortedRows) {
    const cat = row.kategori_transaksi;
    const debit = row.debit || 0;
    const kredit = row.kredit || 0;
    const keperluan = (row.keperluan || "").toLowerCase();

    // ── Saldo (always debit - kredit, all rows) ────────────────────────
    if (!truthyOverride(row[overrideField("saldo")])) {
      running["saldo"] = (running["saldo"] ?? 0) + debit - kredit;
    } else {
      running["saldo"] = rowNum(row, "saldo");
    }

    // ── Accumulator columns (driven by category contributions) ─────────
    for (const rule of accumulatorRules) {
      const col = rule.column_name;
      if (truthyOverride(row[overrideField(col)])) {
        running[col] = rowNum(row, col);
        continue;
      }
      const catContribs = contributionLookup[cat];
      if (catContribs) {
        for (const contrib of catContribs) {
          if (contrib.column === col) {
            const amount = contrib.amount_field === "debit" ? debit : kredit;
            running[col] = (running[col] ?? 0) + amount * contrib.sign;
          }
        }
      }
    }

    // ── Kasbon conditional columns ─────────────────────────────────────
    for (const rule of kasbonRules) {
      const col = rule.column_name;
      if (truthyOverride(row[overrideField(col)])) {
        running[col] = rowNum(row, col);
        continue;
      }
      const cond: KasbonConditions | null = parseKasbonConditions(rule.kasbon_conditions);
      if (!cond) continue;
      const catMatch = cond.categories.includes(cat);
      const keperluanMatch =
        !cond.keperluan_contains ||
        keperluan.includes(cond.keperluan_contains.toLowerCase());
      if (catMatch && keperluanMatch) {
        const delta =
          cond.amount === "kredit_minus_debit" ? kredit - debit : debit - kredit;
        running[col] = (running[col] ?? 0) + delta;
      }
    }

    // ── Formula columns (evaluated after accumulators) ─────────────────
    for (const rule of formulaRules) {
      const col = rule.column_name;
      if (truthyOverride(row[overrideField(col)])) {
        running[col] = rowNum(row, col);
        continue;
      }
      if (rule.formula_expression) {
        try {
          running[col] = evaluateFormula(rule.formula_expression, { ...running });
        } catch {
          // On formula error, keep previous running value
        }
      }
    }

    // ── Profit share columns (driven by profitPartners config) ─────────
    for (const partner of profitPartners) {
      const col = partner.sourceColumn;
      const oKey = overrideField(col);
      if (truthyOverride(row[oKey])) {
        running[col] = rowNum(row, col);
        continue;
      }

      const divisor = partner.shareDivisor > 0 ? partner.shareDivisor : 3;
      const runningLabaBersih = running["laba_bersih"] ?? 0;

      if (partner.formula === "percentage_based") {
        const pct =
          partner.sharePercent != null && partner.sharePercent >= 0
            ? partner.sharePercent
            : 100;
        running[col] = runningLabaBersih * (pct / 100);
      } else if (partner.formula === "third_minus_kasbon") {
        const kasbon = running[partner.kasbonColumn ?? ""] ?? 0;
        running[col] = runningLabaBersih / divisor - kasbon;
      } else if (partner.formula === "incremental_investor") {
        const labaIncrement = runningLabaBersih - prevLabaBersih;
        running[col] = (running[col] ?? 0) + labaIncrement / divisor;
        if (cat === "INVESTOR") {
          running[col] += debit - kredit;
        }
      }
    }

    // ── Collect updates for this row ───────────────────────────────────
    const updates: Record<string, number> = {};

    for (const rule of rules) {
      const col = rule.column_name;
      if (rule.rule_type === "profit_share") continue; // handled below
      if (!truthyOverride(row[overrideField(col)])) {
        updates[col] = running[col] ?? 0;
      }
    }

    for (const partner of profitPartners) {
      const col = partner.sourceColumn;
      if (!truthyOverride(row[overrideField(col)])) {
        updates[col] = running[col] ?? 0;
      }
    }

    if (Object.keys(updates).length > 0) {
      out.push({ id: row.id, updates });
    }

    prevLabaBersih = running["laba_bersih"] ?? 0;
  }

  return out;
}
