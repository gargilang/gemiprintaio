/**
 * transaction-computed-service
 *
 * Helper baca/agregasi untuk tabel `transaksi_terhitung` v2. Inilah
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
         FROM transaksi_terhitung tc
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
 *
 * Strategi: ambil baris keuangan aktif dengan urutan_tampilan tertinggi,
 * lalu gabungkan kolom legacy (saldo, omzet, …) dengan transaksi_terhitung
 * milik baris itu. Lebih andal daripada scan seluruh transaksi_terhitung
 * (yang bisa basi bila recalc penuh belum sempat menulis mirror v2).
 */
export async function getLatestPerFormulaKey(
  yearMonth?: string
): Promise<ComputedSummary> {
  const sb = getServerSupabaseClient();
  if (sb) {
    let q = sb
      .from("keuangan")
      .select(
        "id, saldo, omzet, biaya_operasional, biaya_bahan, laba_bersih, tanggal, urutan_tampilan",
      )
      .is("diarsipkan_pada", null)
      .or("status_transaksi.is.null,status_transaksi.neq.VOIDED")
      .order("urutan_tampilan", { ascending: false })
      .order("dibuat_pada", { ascending: false })
      .limit(1);

    if (yearMonth) {
      const [year, month] = yearMonth.split("-").map(Number);
      if (year && month) {
        const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
        const endMonth = month === 12 ? 1 : month + 1;
        const endYear = month === 12 ? year + 1 : year;
        const end = new Date(endYear, endMonth - 1, 1).toISOString().slice(0, 10);
        q = q.gte("tanggal", start).lt("tanggal", end);
      }
    }

    const { data: latestRow, error } = await q.maybeSingle();
    if (!error && latestRow) {
      const out: ComputedSummary = {
        saldo: Number(latestRow.saldo ?? 0),
        omzet: Number(latestRow.omzet ?? 0),
        biaya_operasional: Number(latestRow.biaya_operasional ?? 0),
        biaya_bahan: Number(latestRow.biaya_bahan ?? 0),
        laba_bersih: Number(latestRow.laba_bersih ?? 0),
      };

      const { data: tcRows } = await sb
        .from("transaksi_terhitung")
        .select("formula_key, value")
        .eq("transaction_id", latestRow.id);

      for (const r of tcRows ?? []) {
        out[r.formula_key] = Number(r.value ?? 0);
      }
      return out;
    }
  }

  try {
    const params: unknown[] = [];
    let whereClause =
      "WHERE k.diarsipkan_pada IS NULL AND COALESCE(k.status_transaksi, 'POSTED') <> 'VOIDED'";
    if (yearMonth) {
      whereClause += ` AND strftime('%Y-%m', k.tanggal) = ?`;
      params.push(yearMonth);
    }

    const latestKeuangan = await db.queryRaw<{
      id: string;
      saldo: number;
      omzet: number;
      biaya_operasional: number;
      biaya_bahan: number;
      laba_bersih: number;
    }>(
      `SELECT id, saldo, omzet, biaya_operasional, biaya_bahan, laba_bersih
         FROM keuangan k
         ${whereClause}
         ORDER BY k.urutan_tampilan DESC, k.dibuat_pada DESC
         LIMIT 1`,
      params,
    );

    const row = latestKeuangan[0];
    if (!row) return {};

    const out: ComputedSummary = {
      saldo: Number(row.saldo ?? 0),
      omzet: Number(row.omzet ?? 0),
      biaya_operasional: Number(row.biaya_operasional ?? 0),
      biaya_bahan: Number(row.biaya_bahan ?? 0),
      laba_bersih: Number(row.laba_bersih ?? 0),
    };

    const tcRows = await db.queryRaw<{ formula_key: string; value: number }>(
      "SELECT formula_key, value FROM transaksi_terhitung WHERE transaction_id = ?",
      [row.id],
    );
    for (const r of tcRows) {
      out[r.formula_key] = Number(r.value ?? 0);
    }
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
      "SELECT formula_key, value FROM transaksi_terhitung WHERE transaction_id = ?",
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
      "SELECT DISTINCT formula_key FROM rumus_buku_kas WHERE actor_id = ? AND enabled = 1",
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
         FROM transaksi_terhitung tc
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
      .from("transaksi_penggantian")
      .upsert(payload, { onConflict: "transaction_id,formula_key" });
    if (error && !error.message.includes("does not exist")) {
      return { error: new Error(error.message) };
    }
  }
  try {
    await db.executeRaw(
      `INSERT INTO transaksi_penggantian (transaction_id, formula_key, override_value, overridden_at)
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
      .from("transaksi_penggantian")
      .delete()
      .eq("transaction_id", transactionId)
      .eq("formula_key", formulaKey);
    if (error && !error.message.includes("does not exist")) {
      return { error: new Error(error.message) };
    }
  }
  try {
    await db.executeRaw(
      "DELETE FROM transaksi_penggantian WHERE transaction_id = ? AND formula_key = ?",
      [transactionId, formulaKey]
    );
  } catch (e) {
    return { error: e as Error };
  }
  return { error: null };
}
