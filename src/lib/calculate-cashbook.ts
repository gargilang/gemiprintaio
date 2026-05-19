/**
 * Central calculation logic for cash book entries (SQLite / server mirror path).
 * Shared rules live in cashbook-recalc-logic.ts for Supabase parity.
 */

import "server-only";

import Database from "better-sqlite3";

import {
  type CashbookRecalcInputRow,
  computeCashbookRecalculationUpdates,
  sortCashbookRowsForRecalc,
} from "./cashbook-recalc-logic";
import {
  getProfitSharePartnersForRecalc,
  getColumnRulesForRecalc,
} from "./services/finance-config-service";

interface CashBookEntry extends CashbookRecalcInputRow {}

/**
 * Recalculate all cash book entries based on entry order (oldest to newest)
 */
export async function recalculateCashbook(
  db: Database.Database,
  whereClause: string = "diarsipkan_pada IS NULL"
): Promise<number> {
  const rows = db
    .prepare(
      `SELECT * FROM keuangan WHERE ${whereClause} ORDER BY urutan_tampilan ASC, dibuat_pada ASC`
    )
    .all() as CashBookEntry[];

  if (rows.length === 0) {
    return 0;
  }

  const sorted = sortCashbookRowsForRecalc(rows);
  const [profitPartners, { columnRules, categories }] = await Promise.all([
    getProfitSharePartnersForRecalc(),
    getColumnRulesForRecalc(),
  ]);
  const batch = computeCashbookRecalculationUpdates(sorted, profitPartners, columnRules, categories);

  for (const { id, updates } of batch) {
    const keys = Object.keys(updates);
    if (keys.length === 0) continue;
    const sets = keys.map((k) => `${k} = ?`);
    const vals = keys.map((k) => updates[k]);
    const sql = `UPDATE keuangan SET ${sets.join(", ")} WHERE id = ?`;
    db.prepare(sql).run(...vals, id);
  }

  return rows.length;
}
