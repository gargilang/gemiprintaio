/**
 * Hitung ulang buku kas yang digerakkan oleh formula AST yang didefinisikan pengguna.
 *
 * Menggantikan logika hardcoded sebelumnya di `calculate-cashbook.ts` +
 * `cashbook-recalc-logic.ts`. Ekspor publik dipertahankan kompatibel nama
 * supaya pemanggil yang ada (pos-service, finance-service, purchases-service)
 * tetap bekerja tanpa perubahan invasif.
 *
 * Alur per perhitungan ulang:
 *   1. Tarik baris (urut `urutan_tampilan`, lalu `dibuat_pada`).
 *   2. Muat formula + partner aktif dari DB. Jatuh balik ke default seed
 *      kalau DB belum punya baris (safety net first-run).
 *   3. Telusuri dataset baris-per-baris memakai evaluator AST. Argumen
 *      `prevOutputs` untuk baris N adalah snapshot output baris N-1 (supaya
 *      formula kumulatif seperti saldo / omzet berperilaku seperti formula
 *      asli di Sheets).
 *   4. Untuk tiap baris, bangun map `updates`. Kolom dengan flag
 *      `override_<col>=1` dilewati supaya override manual pengguna menang.
 *   5. Tulis `updates` balik ke baris.
 */

import "server-only";

import type Database from "better-sqlite3";

import {
  evaluate,
  sortFormulasByDependency,
  type EvalContext,
} from "./evaluator";
import {
  DEFAULT_FORMULAS,
  DEFAULT_PARTNERS,
  cloneDefaults,
} from "./defaults";
import {
  FormulaEvalError,
  SearchNotFoundError,
  resolveFormulaKey,
  type FormulaDefinition,
  type InputRow,
  type OutputRow,
  type PartnerDefinition,
} from "./types";

/** Bentuk baris yang dikonsumsi engine recalc. */
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
  status_transaksi?: string | null;

  // Kolom hasil hitungan — dibaca di sini untuk fallback nilai override.
  omzet?: number;
  biaya_operasional?: number;
  biaya_bahan?: number;
  saldo?: number;
  laba_bersih?: number;

  // Flag override — 1 / true berarti "pertahankan nilai DB, jangan hitung ulang".
  override_omzet?: number | boolean;
  override_biaya_operasional?: number | boolean;
  override_biaya_bahan?: number | boolean;
  override_saldo?: number | boolean;
  override_laba_bersih?: number | boolean;

  [key: string]: unknown;
}

/** Urutan kaskade: baris terlama duluan, tie diputus oleh created-at. */
export function sortCashbookRowsForRecalc<T extends CashbookRecalcInputRow>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const uo = Number(a.urutan_tampilan) - Number(b.urutan_tampilan);
    if (uo !== 0) return uo;
    return String(a.dibuat_pada).localeCompare(String(b.dibuat_pada));
  });
}

function truthyOverride(v: unknown): boolean {
  return v === 1 || v === true || v === "1";
}

function inputForRow(row: CashbookRecalcInputRow): InputRow {
  return {
    C: String(row.kategori_transaksi ?? ""),
    D: Number(row.debit ?? 0) || 0,
    E: Number(row.kredit ?? 0) || 0,
    F: String(row.keperluan ?? ""),
  };
}

/**
 * Pure computation of per-row updates. Exposed so unit tests + the
 * `/api/evaluate` endpoint can run the same engine without DB access.
 *
 * The result includes both:
 *   • `updates`: legacy keuangan column patch (omzet, biaya_*, kasbon_*, etc.)
 *   • `computed`: semantic (formulaKey → value) pairs destined for
 *     `transaction_computed` in the v2 architecture
 *
 * Both are emitted so callers can dual-write during the migration window.
 */
export function computeCashbookRecalculationUpdates(
  sortedRows: CashbookRecalcInputRow[],
  formulas: FormulaDefinition[] = cloneDefaults(DEFAULT_FORMULAS),
  partners: PartnerDefinition[] = cloneDefaults(DEFAULT_PARTNERS)
): Array<{
  id: string;
  updates: Record<string, number>;
  computed: Record<string, number>;
  outputs: OutputRow;
}> {
  const active = formulas.filter((f) => f.enabled);
  const ordered = sortFormulasByDependency(active);

  const partnerMap: Record<string, PartnerDefinition> = {};
  for (const p of partners) partnerMap[p.id] = p;

  // Build groupKeys map for SUM_GROUP() — formula_group → list of column ids.
  const groupKeys: Record<string, string[]> = {};
  for (const f of active) {
    const g = f.formulaGroup;
    if (!g) continue;
    if (!groupKeys[g]) groupKeys[g] = [];
    groupKeys[g].push(f.column);
  }

  const out: Array<{
    id: string;
    updates: Record<string, number>;
    computed: Record<string, number>;
    outputs: OutputRow;
  }> = [];

  let prevOutputs: OutputRow = {};

  for (let i = 0; i < sortedRows.length; i++) {
    const row = sortedRows[i];
    const input = inputForRow(row);
    const currentOutputs: OutputRow = {};

    for (const formula of ordered) {
      const ctx: EvalContext = {
        row: i + 2,
        input,
        prevOutputs,
        currentOutputs,
        partners: partnerMap,
        groupKeys,
      };
      try {
        currentOutputs[formula.column] = evaluate(formula.ast, ctx);
      } catch (err) {
        if (err instanceof SearchNotFoundError || err instanceof FormulaEvalError) {
          currentOutputs[formula.column] = 0;
        } else {
          throw err;
        }
      }
    }

    const updates: Record<string, number> = {};
    const computed: Record<string, number> = {};
    for (const formula of ordered) {
      const dbCol = formula.dbColumn;
      const formulaKey = resolveFormulaKey(formula);
      const value = currentOutputs[formula.column];
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "boolean"
            ? value
              ? 1
              : 0
            : Number(value) || 0;

      // Always populate the semantic (transaction_computed) map.
      if (formulaKey) computed[formulaKey] = numeric;

      // Legacy keuangan column update — skip when an explicit override exists.
      if (dbCol) {
        if (truthyOverride(row[`override_${dbCol}`])) continue;
        updates[dbCol] = numeric;
      }
    }

    out.push({ id: row.id, updates, computed, outputs: currentOutputs });

    // Build prevOutputs for the next row. Index by both the legacy letter
    // (formula.column) AND the semantic formulaKey so that AST nodes using
    // prevOut("kasbon_suri") resolve correctly alongside prevOut("J").
    const nextPrevOutputs: OutputRow = { ...currentOutputs };
    for (const formula of ordered) {
      const fKey = resolveFormulaKey(formula);
      if (fKey && fKey !== formula.column) {
        nextPrevOutputs[fKey] = currentOutputs[formula.column];
      }
    }
    prevOutputs = nextPrevOutputs;
  }

  return out;
}

/**
 * Recalculate every active cashbook row using AST formulas + partners stored
 * in SQLite. Returns the number of rows scanned (matches the legacy API so
 * external callers don't need to change).
 */
export async function recalculateCashbook(
  db: Database.Database,
  whereClause: string = "diarsipkan_pada IS NULL AND COALESCE(status_transaksi, 'POSTED') <> 'VOIDED'"
): Promise<number> {
  const rows = db
    .prepare(
      `SELECT * FROM keuangan WHERE ${whereClause} ORDER BY urutan_tampilan ASC, dibuat_pada ASC`
    )
    .all() as CashbookRecalcInputRow[];

  if (rows.length === 0) return 0;

  const sorted = sortCashbookRowsForRecalc(rows);
  const formulas = loadFormulasFromSqlite(db);
  const partners = loadPartnersFromSqlite(db);
  const batch = computeCashbookRecalculationUpdates(sorted, formulas, partners);

  // Detect whether the v2 mirror tables exist locally so we can dual-write
  // without crashing on installs that haven't run the migration yet.
  const hasComputedTable = tableExists(db, "transaction_computed");
  const hasOverridesTable = tableExists(db, "transaction_overrides");

  const overrideMap = hasOverridesTable
    ? loadOverrideMap(db)
    : new Map<string, Map<string, number>>();

  const tcInsert = hasComputedTable
    ? db.prepare(
        `INSERT INTO transaction_computed (transaction_id, formula_key, value, computed_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(transaction_id, formula_key) DO UPDATE SET
           value = excluded.value,
           computed_at = excluded.computed_at`
      )
    : null;

  for (const { id, updates, computed } of batch) {
    // Legacy column update (only for keys not manually overridden).
    const keys = Object.keys(updates);
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = ?`);
      const vals = keys.map((k) => updates[k]);
      const sql = `UPDATE keuangan SET ${sets.join(", ")} WHERE id = ?`;
      db.prepare(sql).run(...vals, id);
    }

    // v2 dual-write: transaction_computed, honouring transaction_overrides.
    if (tcInsert) {
      const rowOverrides = overrideMap.get(id);
      for (const [formulaKey, value] of Object.entries(computed)) {
        const ov = rowOverrides?.get(formulaKey);
        tcInsert.run(id, formulaKey, ov ?? value);
      }
    }
  }

  return rows.length;
}

function tableExists(db: Database.Database, name: string): boolean {
  try {
    const row = db
      .prepare(
        "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1"
      )
      .get(name) as { ok?: number } | undefined;
    return Boolean(row?.ok);
  } catch {
    return false;
  }
}

function loadOverrideMap(db: Database.Database): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  try {
    const rows = db
      .prepare(
        "SELECT transaction_id, formula_key, override_value FROM transaction_overrides"
      )
      .all() as Array<{
      transaction_id: string;
      formula_key: string;
      override_value: number;
    }>;
    for (const r of rows) {
      let inner = map.get(r.transaction_id);
      if (!inner) {
        inner = new Map();
        map.set(r.transaction_id, inner);
      }
      inner.set(r.formula_key, Number(r.override_value));
    }
  } catch {
    // table missing — nothing to override
  }
  return map;
}

// ── SQLite I/O helpers ─────────────────────────────────────────────────────

interface FormulaRow {
  id: string;
  name: string;
  column_key: string;
  db_column: string;
  ast: string;
  enabled: number;
  is_system: number;
  display_order: number;
  description: string | null;
}

interface PartnerRow {
  id: string;
  name: string;
  category: string | null;
  display_order: number;
}

function loadFormulasFromSqlite(db: Database.Database): FormulaDefinition[] {
  try {
    const rows = db
      .prepare(
        "SELECT * FROM cashbook_formula WHERE enabled = 1 ORDER BY display_order ASC"
      )
      .all() as FormulaRow[];
    if (rows.length === 0) return cloneDefaults(DEFAULT_FORMULAS);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      column: r.column_key,
      dbColumn: r.db_column,
      ast: JSON.parse(r.ast),
      enabled: r.enabled === 1,
      isSystem: r.is_system === 1,
      displayOrder: r.display_order,
      description: r.description ?? null,
    }));
  } catch {
    return cloneDefaults(DEFAULT_FORMULAS);
  }
}

function loadPartnersFromSqlite(db: Database.Database): PartnerDefinition[] {
  try {
    const rows = db
      .prepare(
        "SELECT * FROM cashbook_partner ORDER BY display_order ASC"
      )
      .all() as PartnerRow[];
    if (rows.length === 0) return cloneDefaults(DEFAULT_PARTNERS);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category ?? null,
      displayOrder: r.display_order,
    }));
  } catch {
    return cloneDefaults(DEFAULT_PARTNERS);
  }
}
