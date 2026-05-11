/**
 * Duplicate / FK-presence checks that work on Supabase (serverless) and SQLite fallback.
 */

import "server-only";

import { db, getServerSupabaseClient } from "./db-unified";
import {
  existsPembelianForVendor,
  existsPenjualanForPelanggan,
  existsTableRow,
} from "./server-data-supabase";

function supabaseConfigured(): boolean {
  return !!getServerSupabaseClient();
}

/**
 * Fixed table/column identifiers only (caller must not pass user-controlled names).
 */
export async function rowExistsEq(
  table: string,
  column: string,
  value: string | number,
  excludeId?: string
): Promise<boolean> {
  if (supabaseConfigured()) {
    return existsTableRow(table, column, value, excludeId);
  }
  const rows = await db.queryRaw<{ id: string }>(
    excludeId
      ? `SELECT id FROM ${table} WHERE ${column} = ? AND id != ? LIMIT 1`
      : `SELECT id FROM ${table} WHERE ${column} = ? LIMIT 1`,
    excludeId ? [value, excludeId] : [value]
  );
  return rows.length > 0;
}

export async function pelangganHasPenjualan(pelangganId: string): Promise<boolean> {
  if (supabaseConfigured()) {
    return existsPenjualanForPelanggan(pelangganId);
  }
  const rows = await db.queryRaw<{ id: string }>(
    "SELECT id FROM penjualan WHERE pelanggan_id = ? LIMIT 1",
    [pelangganId]
  );
  return rows.length > 0;
}

export async function vendorHasPembelian(vendorId: string): Promise<boolean> {
  if (supabaseConfigured()) {
    return existsPembelianForVendor(vendorId);
  }
  const rows = await db.queryRaw<{ id: string }>(
    "SELECT id FROM pembelian WHERE vendor_id = ? LIMIT 1",
    [vendorId]
  );
  return rows.length > 0;
}

/** Multiple column equality (AND). Column names must be fixed literals from code. */
export async function rowExistsCompositeEq(
  table: string,
  pairs: Array<[string, string | number]>,
  excludeId?: string
): Promise<boolean> {
  const sb = getServerSupabaseClient();
  if (sb) {
    let q = sb.from(table).select("id");
    for (const [col, val] of pairs) {
      q = q.eq(col, val);
    }
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return !!data;
  }
  const conditions = pairs.map(([c]) => `${c} = ?`).join(" AND ");
  const vals = pairs.map(([, v]) => v);
  const sql = excludeId
    ? `SELECT id FROM ${table} WHERE ${conditions} AND id != ? LIMIT 1`
    : `SELECT id FROM ${table} WHERE ${conditions} LIMIT 1`;
  const rows = await db.queryRaw<{ id: string }>(
    sql,
    excludeId ? [...vals, excludeId] : vals
  );
  return rows.length > 0;
}
