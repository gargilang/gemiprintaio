/**
 * transaction-computed-service
 *
 * Helper baca/agregasi untuk tabel `transaction_computed` v2. Inilah
 * yang dikonsumsi UI Keuangan baru (Bagi Hasil, Kasbon, Bonus) untuk
 * merender total per-orang tanpa menyentuh kolom hardcoded legacy
 * di tabel `keuangan`.
 */

import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";

/** Map dari `formula_key` → nilai kumulatif sepanjang window query. */
export type ComputedSummary = Record<string, number>;

/** Nilai computed untuk satu transaksi, dikunci oleh formula_key. */
export type ComputedRowMap = Record<string, number>;

/**
 * Agregasikan nilai terakhir per formula_key di seluruh transaksi pada
 * bulan YYYY-MM tertentu (atau global kalau bulan tidak diisi).
 *
 * Untuk metrik kumulatif (omzet, saldo, laba_bersih) ini mengembalikan
 * nilai dari baris TERAKHIR di periode itu karena engine AST memperlakukan
 * formula tersebut sebagai running total. Untuk metrik per-transaksi ini
 * mengembalikan SUM.
 *
 * Strategi:
 *   • Tarik semua baris (transaction_id, formula_key, value) untuk periode
 *   • Group by formula_key
 *   • Untuk sekarang, kembalikan SUM — pemanggil bisa beralih ke "last"
 *     dengan flag
 *
 * Penanganan kumulatif vs inkremental adalah follow-up yang sudah diketahui;
 * UI v2 dimulai dengan menampilkan jumlah mentah supaya pengguna langsung
 * melihat total per-bulan actor mereka, lalu nanti di-refine.
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
    // Tabel hilang di instalasi tanpa migrasi — kembalikan kosong.
    return {};
  }
}

/**
 * Nilai terakhir per formula_key — berguna untuk metrik kumulatif di mana
 * "baris terakhir di periode" adalah angka yang benar untuk ditampilkan.
 */
export async function getLatestPerFormulaKey(
  yearMonth?: string
): Promise<ComputedSummary> {
  // Pendekatan: untuk tiap formula_key, ambil nilai dari transaksi terbaru
  // (urut urutan_tampilan, lalu dibuat_pada) di window.
  const sb = getServerSupabaseClient();
  if (sb) {
    let q = sb
      .from("transaction_computed")
      .select("transaction_id, formula_key, value, keuangan!inner(tanggal, urutan_tampilan, dibuat_pada)");
    if (yearMonth) {
      // Supabase tidak mendukung strftime — jatuh balik ke filter rentang.
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
      // Group: untuk tiap formula_key, simpan baris dengan urutan_tampilan tertinggi.
      // Supabase bisa mengembalikan baris yang di-join sebagai array atau objek
      // tunggal tergantung kardinalitas relasi — normalisasi keduanya.
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

/** Semua nilai computed untuk satu transaksi. */
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

/** Semua nilai computed untuk formula yang tertaut ke satu actor di sebuah periode. */
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

/** Simpan override manual yang menang dari hasil perhitungan ulang. */
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
