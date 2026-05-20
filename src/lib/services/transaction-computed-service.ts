/**
 * transaction-computed-service
 *
 * Read/aggregate helpers for the v2 `transaction_computed` table. This is
 * what the new Keuangan UI bars (Bagi Hasil, Kasbon, Bonus) consume to
 * render per-person totals without hitting the legacy hardcoded columns
 * on the `keuangan` table.
 */

import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

/** Map of `formula_key` → cumulative value across a query window. */
export type ComputedSummary = Record<string, number>;

/** One transaction's computed values, keyed by formula_key. */
export type ComputedRowMap = Record<string, number>;

/**
 * Aggregate the latest value per formula_key across all transactions in a
 * given YYYY-MM month (or globally when month is omitted).
 *
 * For cumulative metrics (omzet, saldo, laba_bersih) this returns the
 * value from the LAST row of the period because the AST engine treats
 * those formulas as running totals. For per-transaction metrics this
 * returns the SUM.
 *
 * Strategy:
 *   • Pull all (transaction_id, formula_key, value) rows for the period
 *   • Group by formula_key
 *   • For now, return SUM — caller can switch to "last" with a flag
 *
 * Cumulative vs incremental treatment is a known follow-up; the v2 UI
 * starts by surfacing raw sums so the user immediately sees their
 * actors' per-month totals, then we refine.
 */
export async function getMonthSummary(
  yearMonth?: string
): Promise<ComputedSummary> {
  const params: unknown[] = [];
  let whereClause = "";
  if (yearMonth) {
    whereClause = `WHERE tc.transaction_id IN (
      SELECT id FROM keuangan WHERE strftime('%Y-%m', tanggal) = ?
    )`;
    params.push(yearMonth);
  }

  try {
    const rows = await db.queryRaw<{ formula_key: string; total: number }>(
      `SELECT tc.formula_key AS formula_key, SUM(tc.value) AS total
         FROM transaction_computed tc
        ${whereClause}
        GROUP BY tc.formula_key`,
      params
    );
    const out: ComputedSummary = {};
    for (const r of rows) {
      out[r.formula_key] = Number(r.total ?? 0);
    }
    return out;
  } catch {
    // Table missing on installs without the migration — return empty.
    return {};
  }
}

/**
 * Latest value per formula_key — useful for cumulative metrics where the
 * "last row of the period" is the right number to show.
 */
export async function getLatestPerFormulaKey(
  yearMonth?: string
): Promise<ComputedSummary> {
  // Approach: for each formula_key, pick the value from the latest
  // transaction (by urutan_tampilan, then dibuat_pada) in the window.
  const sb = getServerSupabaseClient();
  if (sb) {
    let q = sb
      .from("transaction_computed")
      .select("transaction_id, formula_key, value, keuangan!inner(tanggal, urutan_tampilan, dibuat_pada)");
    if (yearMonth) {
      // Supabase doesn't support strftime — fall back to range filter.
      const [year, month] = yearMonth.split("-").map(Number);
      if (year && month) {
        const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const end = new Date(endYear, endMonth - 1, 1).toISOString().slice(0, 10);
        q = q.gte("keuangan.tanggal", start).lt("keuangan.tanggal", end);
      }
    }
    const { data } = await q;
    if (Array.isArray(data) && data.length > 0) {
      // Group: for each formula_key, keep the row with highest urutan_tampilan.
      // Supabase may return the joined row as an array or single object
      // depending on the relationship cardinality — normalize both.
      const grouped = new Map<string, { order: number; val: number }>();
      type JoinRow = {
        formula_key: string;
        value: number | string;
        keuangan:
          | { urutan_tampilan?: number | null }
          | Array<{ urutan_tampilan?: number | null }>
          | null;
      };
      for (const r of data as unknown as JoinRow[]) {
        const k = Array.isArray(r.keuangan) ? r.keuangan[0] : r.keuangan;
        const order = k?.urutan_tampilan ?? 0;
        const existing = grouped.get(r.formula_key);
        if (!existing || order > existing.order) {
          grouped.set(r.formula_key, { order, val: Number(r.value) });
        }
      }
      const out: ComputedSummary = {};
      for (const [k, v] of grouped) out[k] = v.val;
      return out;
    }
  }

  try {
    const params: unknown[] = [];
    let whereClause = "";
    if (yearMonth) {
      whereClause = `WHERE strftime('%Y-%m', k.tanggal) = ?`;
      params.push(yearMonth);
    }
    const rows = await db.queryRaw<{ formula_key: string; value: number }>(
      `SELECT tc.formula_key AS formula_key, tc.value AS value
         FROM transaction_computed tc
         JOIN keuangan k ON k.id = tc.transaction_id
         ${whereClause}
         JOIN (
           SELECT tc2.formula_key, MAX(k2.urutan_tampilan) AS max_order
             FROM transaction_computed tc2
             JOIN keuangan k2 ON k2.id = tc2.transaction_id
            ${whereClause ? whereClause.replace(/\bk\b/g, "k2") : ""}
            GROUP BY tc2.formula_key
         ) latest
           ON latest.formula_key = tc.formula_key
          AND latest.max_order   = k.urutan_tampilan`,
      [...params, ...(yearMonth ? [yearMonth] : [])]
    );
    const out: ComputedSummary = {};
    for (const r of rows) out[r.formula_key] = Number(r.value ?? 0);
    return out;
  } catch {
    return {};
  }
}

/** All computed values for a single transaction. */
export async function getComputedRow(
  transactionId: string
): Promise<ComputedRowMap> {
  try {
    const rows = await db.queryRaw<{ formula_key: string; value: number }>(
      "SELECT formula_key, value FROM transaction_computed WHERE transaction_id = ?",
      [transactionId]
    );
    const out: ComputedRowMap = {};
    for (const r of rows) out[r.formula_key] = Number(r.value);
    return out;
  } catch {
    return {};
  }
}

/** All computed values for one actor's linked formulas in a period. */
export async function getActorMetrics(
  actorId: string,
  yearMonth?: string
): Promise<ComputedSummary> {
  try {
    const keyRows = await db.queryRaw<{ formula_key: string }>(
      "SELECT DISTINCT formula_key FROM cashbook_formula WHERE actor_id = ? AND enabled = 1",
      [actorId]
    );
    const keys = keyRows.map((r) => r.formula_key).filter(Boolean);
    if (keys.length === 0) return {};

    const placeholders = keys.map(() => "?").join(",");
    const params: unknown[] = [...keys];
    let dateClause = "";
    if (yearMonth) {
      dateClause = `AND tc.transaction_id IN (
        SELECT id FROM keuangan WHERE strftime('%Y-%m', tanggal) = ?
      )`;
      params.push(yearMonth);
    }
    const rows = await db.queryRaw<{ formula_key: string; total: number }>(
      `SELECT formula_key, SUM(value) AS total
         FROM transaction_computed tc
        WHERE formula_key IN (${placeholders})
          ${dateClause}
        GROUP BY formula_key`,
      params
    );
    const out: ComputedSummary = {};
    for (const r of rows) out[r.formula_key] = Number(r.total ?? 0);
    return out;
  } catch {
    return {};
  }
}

/** Persist a manual override that wins over recalculation. */
export async function setOverride(
  transactionId: string,
  formulaKey: string,
  value: number
): Promise<{ error: Error | null }> {
  const payload = {
    transaction_id: transactionId,
    formula_key: formulaKey,
    override_value: value,
    overridden_at: new Date().toISOString(),
  };
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("transaction_overrides")
      .upsert(payload, { onConflict: "transaction_id,formula_key" });
    if (error && !error.message.includes("does not exist")) {
      return { error: new Error(error.message) };
    }
  }
  try {
    await db.executeRaw(
      `INSERT INTO transaction_overrides (transaction_id, formula_key, override_value, overridden_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(transaction_id, formula_key) DO UPDATE SET
         override_value = excluded.override_value,
         overridden_at = excluded.overridden_at`,
      [transactionId, formulaKey, value, payload.overridden_at]
    );
  } catch (e) {
    return { error: e as Error };
  }
  return { error: null };
}

export async function clearOverride(
  transactionId: string,
  formulaKey: string
): Promise<{ error: Error | null }> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("transaction_overrides")
      .delete()
      .eq("transaction_id", transactionId)
      .eq("formula_key", formulaKey);
    if (error && !error.message.includes("does not exist")) {
      return { error: new Error(error.message) };
    }
  }
  try {
    await db.executeRaw(
      "DELETE FROM transaction_overrides WHERE transaction_id = ? AND formula_key = ?",
      [transactionId, formulaKey]
    );
  } catch (e) {
    return { error: e as Error };
  }
  return { error: null };
}
