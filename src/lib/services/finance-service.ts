/**
 * Finance Service
 * Operasi buku kas dengan kalkulasi saldo berjalan via engine AST.
 */

import "server-only";

import {
  type CashbookRecalcInputRow,
  computeCashbookRecalculationUpdates,
  sortCashbookRowsForRecalc,
} from "@/lib/ast/cashbook-recalc";
import {
  listActiveFormulas,
  listPartners,
} from "@/lib/services/cashbook-formula-service";
import {
  db,
  generateId,
  getCurrentTimestamp,
  getServerSupabaseClient,
} from "../db-unified";
import {
  deleteKeuanganWhereNotArchived,
  getMaxUrutanTampilanKeuangan,
} from "../server-data-supabase";
import { createCoalescedRunner } from "../coalesce";

export interface CashBookEntry {
  id: string;
  tanggal: string;
  kategori_transaksi: string;
  debit: number;
  kredit: number;
  keperluan?: string;
  catatan?: string;
  saldo: number;
  omzet: number;
  biaya_operasional: number;
  biaya_bahan: number;
  laba_bersih: number;
  urutan_tampilan: number;
  dibuat_oleh?: string;
  diarsipkan_pada?: string;
  status_transaksi?: "POSTED" | "VOIDED";
  reference_type?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

/**
 * Ambil semua entri buku kas aktif (yang belum diarsipkan)
 */
export async function getCashBookEntries(): Promise<CashBookEntry[]> {
  try {
    const result = await db.query<CashBookEntry>("keuangan", {
      where: { diarsipkan_pada: null },
      orderBy: { column: "urutan_tampilan", ascending: false },
    });

    if (result.error) throw result.error;
    return (result.data || []).filter(
      (row) => row.status_transaksi !== "VOIDED",
    );
  } catch (error) {
    console.error("Error fetching cash book entries:", error);
    throw error;
  }
}

/**
 * Ambil satu entri buku kas
 */
export async function getCashBookEntry(
  id: string,
): Promise<CashBookEntry | null> {
  try {
    const result = await db.queryOne<CashBookEntry>("keuangan", {
      where: { id },
    });

    if (result.error) throw result.error;
    return result.data;
  } catch (error) {
    console.error("Error fetching cash book entry:", error);
    throw error;
  }
}

/**
 * Buat entri buku kas baru — insert dengan nilai nol dulu,
 * lalu jalankan recalc AST penuh untuk mengisi semua kolom terhitung.
 */
export async function createCashBookEntry(data: {
  tanggal: string;
  kategori_transaksi: string;
  debit?: number;
  kredit?: number;
  keperluan?: string;
  catatan?: string;
  dibuat_oleh?: string;
}): Promise<{ id: string; cashBook: CashBookEntry | null }> {
  const debit = data.debit ?? 0;
  const kredit = data.kredit ?? 0;

  if (!data.tanggal || !data.kategori_transaksi) {
    throw new Error("Tanggal dan kategori wajib diisi");
  }

  if (debit > 0 && kredit > 0) {
    throw new Error("Tidak boleh mengisi debit dan kredit bersamaan");
  }

  if (debit === 0 && kredit === 0) {
    throw new Error("Debit atau kredit harus diisi");
  }

  const nextOrder = await nextUrutanTampilanKeuangan();
  const id = generateId();
  const now = getCurrentTimestamp();

  const entry = {
    id,
    tanggal: data.tanggal,
    kategori_transaksi: data.kategori_transaksi,
    debit,
    kredit,
    keperluan: data.keperluan ?? "",
    catatan: data.catatan ?? "",
    urutan_tampilan: nextOrder,
    dibuat_oleh: data.dibuat_oleh ?? "",
    dibuat_pada: now,
    diperbarui_pada: now,
    omzet: 0,
    biaya_operasional: 0,
    biaya_bahan: 0,
    saldo: 0,
    laba_bersih: 0,
  };

  const result = await db.insert("keuangan", entry);
  if (result.error) throw result.error;

  await recalculateCashbookIfAvailable();

  const cashBook = await getCashBookEntry(id);
  return { id, cashBook };
}

/**
 * Perbarui entri buku kas
 */
export async function updateCashBookEntry(
  id: string,
  data: Partial<CashBookEntry>,
): Promise<void> {
  try {
    const result = await db.update("keuangan", id, data);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error updating cash book entry:", error);
    throw error;
  }
}

/**
 * Hapus entri buku kas
 */
export async function deleteCashBookEntry(id: string): Promise<void> {
  try {
    const result = await db.delete("keuangan", id);
    if (result.error) throw result.error;
  } catch (error) {
    console.error("Error deleting cash book entry:", error);
    throw error;
  }
}

/**
 * Hitung ulang seluruh baris buku kas memakai formula AST + partner.
 * Memakai SQLite native saat tersedia DAN Supabase saat tersedia, supaya
 * mirror `transaksi_terhitung` v2 tetap konsisten dengan kolom `keuangan`
 * legacy terlepas dari DB mana yang dibaca UI.
 *
 * Mengembalikan true kalau setidaknya satu jalur recalc sukses.
 *
 * COALESCING (D-I8): recalc penuh itu O(n) terhadap jumlah baris keuangan dan
 * kerap dipicu beruntun/berbarengan (multi-user, beberapa mutasi). Wrapper ini
 * memastikan TIDAK ADA dua recalc jalan bersamaan, dan N permintaan berbarengan
 * dikolaps. Garansi kesegaran: tiap pemanggil dilayani oleh run yang DIMULAI
 * setelah pemanggilannya (jadi tulisan pemanggil pasti ikut terhitung).
 * Lihat createCoalescedRunner + test di src/lib/__tests__/coalesce.test.ts.
 */
const runRecalcCoalesced = createCoalescedRunner(recalculateCashbookCore);

export function recalculateCashbookIfAvailable(): Promise<boolean> {
  return runRecalcCoalesced();
}

async function recalculateCashbookCore(): Promise<boolean> {
  let didAny = false;
  // 1. SQLite lokal (cache offline-first + mode Tauri / dev native).
  try {
    const sqlite = await db.getNativeSQLite();
    if (sqlite) {
      const { recalculateCashbook } = await import("@/lib/ast/cashbook-recalc");
      await recalculateCashbook(sqlite);
      didAny = true;
    }
  } catch (e) {
    console.warn("[recalculateCashbookIfAvailable] SQLite path failed:", e);
  }
  // 2. Supabase (cloud-of-record). Selalu jalankan saat Supabase sudah dikonfigurasi,
  // walau SQLite juga sudah jalan, karena UI membaca transaksi_terhitung
  // dari Supabase via getLatestPerFormulaKey.
  try {
    const ok = await recalculateCashbookViaSupabase();
    didAny = didAny || ok;
  } catch (e) {
    console.warn("[recalculateCashbookIfAvailable] Supabase path failed:", e);
  }
  return didAny;
}

async function nextUrutanTampilanKeuangan(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const max = await getMaxUrutanTampilanKeuangan();
    return max + 1;
  }
  const maxOrderResult = await db.queryRaw<{ max_order: number }>(
    "SELECT MAX(urutan_tampilan) as max_order FROM keuangan",
    [],
  );
  return (maxOrderResult[0]?.max_order ?? 0) + 1;
}

async function recalculateCashbookViaSupabase(): Promise<boolean> {
  const sb = getServerSupabaseClient();
  if (!sb) return false;

  const { data: rows, error } = await sb
    .from("keuangan")
    .select("*")
    .is("diarsipkan_pada", null)
    .order("urutan_tampilan", { ascending: true })
    .order("dibuat_pada", { ascending: true });

  if (error) {
    console.warn("recalculateCashbookViaSupabase fetch:", error);
    return false;
  }

  const sorted = sortCashbookRowsForRecalc(
    ((rows || []) as CashbookRecalcInputRow[]).filter(
      (row) => row.status_transaksi !== "VOIDED",
    ),
  );
  const [formulas, partners] = await Promise.all([
    listActiveFormulas(),
    listPartners(),
  ]);
  const batch = computeCashbookRecalculationUpdates(sorted, formulas, partners);

  // Muat override v2 supaya kita memakainya saat menulis transaksi_terhitung.
  const overrideMap = new Map<string, Map<string, number>>();
  try {
    const { data: ovs } = await sb
      .from("transaksi_penggantian")
      .select("transaction_id, formula_key, override_value");
    for (const r of (ovs ?? []) as Array<{
      transaction_id: string;
      formula_key: string;
      override_value: number;
    }>) {
      let inner = overrideMap.get(r.transaction_id);
      if (!inner) {
        inner = new Map();
        overrideMap.set(r.transaction_id, inner);
      }
      inner.set(r.formula_key, Number(r.override_value));
    }
  } catch {
    // tabel mungkin belum ada di instalasi yang belum menjalankan migrasi
  }

  // Kumpulkan semua baris v2 supaya bisa di-upsert dalam satu batch.
  const computedRows: Array<{
    transaction_id: string;
    formula_key: string;
    value: number;
    computed_at: string;
  }> = [];
  const nowIso = new Date().toISOString();

  for (const { id, updates, computed } of batch) {
    if (Object.keys(updates).length > 0) {
      const res = await db.update("keuangan", id, updates);
      if (res.error) {
        console.warn("recalculateCashbookViaSupabase update:", res.error);
      }
    }

    const rowOverrides = overrideMap.get(id);
    for (const [formulaKey, value] of Object.entries(computed)) {
      const ov = rowOverrides?.get(formulaKey);
      computedRows.push({
        transaction_id: id,
        formula_key: formulaKey,
        value: ov ?? value,
        computed_at: nowIso,
      });
    }
  }

  // Tulis dual-write best-effort ke transaksi_terhitung; tolerate tabel hilang.
  if (computedRows.length > 0) {
    try {
      const { error: tcErr } = await sb
        .from("transaksi_terhitung")
        .upsert(computedRows, {
          onConflict: "transaction_id,formula_key",
        });
      if (
        tcErr &&
        !tcErr.message.includes("does not exist") &&
        !tcErr.message.includes("schema cache")
      ) {
        console.warn("transaksi_terhitung upsert:", tcErr.message);
      }
    } catch (e) {
      console.warn("transaksi_terhitung upsert exception:", e);
    }
  }

  return true;
}

/**
 * Hapus baris buku kas manual (blokir baris yang terkait pembelian via [REF:purchase-).
 */
export async function deleteManualCashBookEntry(
  id: string,
): Promise<"deleted" | "not_found" | "purchase_linked"> {
  const entry = await getCashBookEntry(id);
  if (!entry) return "not_found";

  // Cek via reference_type + fallback ke keperluan
  if (
    !canDeleteCashBookEntry({
      reference_type: entry.reference_type,
      keperluan: entry.keperluan,
    })
  ) {
    return "purchase_linked";
  }

  const del = await db.delete("keuangan", id);
  if (del.error) throw del.error;
  await recalculateCashbookIfAvailable();
  return "deleted";
}

/**
 * Tentukan apakah baris keuangan dapat dihapus dari Buku Kas.
 * Manual = reference_type NULL atau bukan dari POS/pembelian/kasbon.
 */
export function canDeleteCashBookEntry(entry: {
  reference_type?: string | null;
  keperluan?: string | null;
}): boolean {
  // Baris dari POS, pembelian, atau kasbon TIDAK bisa dihapus dari Buku Kas
  if (
    entry.reference_type === "SALE" ||
    entry.reference_type === "PURCHASE" ||
    entry.reference_type === "PINJAMAN_KARYAWAN"
  ) {
    return false;
  }
  // Fallback: cek token [REF: di keperluan (data sebelum migration)
  const k = entry.keperluan ?? "";
  if (
    k.includes("[REF:purchase-") ||
    k.includes("[REF:pinjaman-") ||
    k.includes("[REF:sale-")
  ) {
    return false;
  }
  return true;
}

/**
 * Perbarui baris buku kas manual (aturan sama dengan legacy PUT /api/finance/cash-book/[id]).
 */
export async function updateManualCashBookEntry(
  id: string,
  body: {
    tanggal: string;
    kategori_transaksi: string;
    debit?: number;
    kredit?: number;
    keperluan?: string;
    catatan?: string;
  },
): Promise<"updated" | "not_found" | "purchase_linked" | "invalid"> {
  const existingEntry = await getCashBookEntry(id);
  if (!existingEntry) return "not_found";
  if (existingEntry.keperluan?.includes("[REF:purchase-")) {
    return "purchase_linked";
  }

  const debitVal =
    typeof body.debit !== "undefined"
      ? Number(body.debit)
      : Number(existingEntry.debit ?? 0);
  const kreditVal =
    typeof body.kredit !== "undefined"
      ? Number(body.kredit)
      : Number(existingEntry.kredit ?? 0);

  if (!body.tanggal || !body.kategori_transaksi) return "invalid";
  if (debitVal > 0 && kreditVal > 0) return "invalid";
  if (debitVal === 0 && kreditVal === 0) return "invalid";

  const upd = await db.update("keuangan", id, {
    tanggal: body.tanggal,
    kategori_transaksi: body.kategori_transaksi,
    debit: debitVal,
    kredit: kreditVal,
    keperluan: body.keperluan ?? "",
    catatan: body.catatan ?? "",
  });
  if (upd.error) throw upd.error;

  await recalculateCashbookIfAvailable();
  return "updated";
}

/** Kolom yang mendukung override manual (berpasangan dengan `override_<column>` di `keuangan`). */
export const CASHBOOK_MANUAL_OVERRIDE_FIELDS = [
  "saldo",
  "omzet",
  "biaya_operasional",
  "biaya_bahan",
  "laba_bersih",
] as const;

export type CashbookManualOverrideField =
  (typeof CASHBOOK_MANUAL_OVERRIDE_FIELDS)[number];

function isCashbookManualOverrideField(
  f: string,
): f is CashbookManualOverrideField {
  return (CASHBOOK_MANUAL_OVERRIDE_FIELDS as readonly string[]).includes(f);
}

/**
 * PATCH override manual pada kolom yang dihitung (disimpan via db-unified → Supabase / SQLite).
 */
export async function patchCashBookManualOverrides(
  id: string,
  body: Record<string, unknown>,
): Promise<"updated" | "no_fields" | "not_found"> {
  const existing = await getCashBookEntry(id);
  if (!existing) return "not_found";

  const patch: Record<string, unknown> = {};
  for (const field of CASHBOOK_MANUAL_OVERRIDE_FIELDS) {
    if (field in body && body[field] !== undefined) {
      patch[field] = body[field];
      patch[`override_${field}`] = 1;
    }
  }

  if (Object.keys(patch).length === 0) return "no_fields";

  const res = await db.update("keuangan", id, patch);
  if (res.error) throw res.error;

  await recalculateCashbookIfAvailable();
  return "updated";
}

/**
 * Bersihkan satu flag override manual (hitung ulang baris dari aturan kalau berlaku).
 */
export async function clearCashBookManualOverride(
  id: string,
  field: string,
): Promise<"cleared" | "not_found" | "invalid_field"> {
  if (!isCashbookManualOverrideField(field)) return "invalid_field";

  const existing = await getCashBookEntry(id);
  if (!existing) return "not_found";

  const res = await db.update("keuangan", id, {
    [`override_${field}`]: 0,
  });
  if (res.error) throw res.error;

  await recalculateCashbookIfAvailable();
  return "cleared";
}

/**
 * Hapus semua entri buku kas aktif (yang sudah diarsipkan tetap utuh)
 */
export async function deleteAllCashbook(): Promise<{ deleted: number }> {
  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      await deleteKeuanganWhereNotArchived();
      return { deleted: 0 };
    }
    await db.executeRaw("DELETE FROM keuangan WHERE diarsipkan_pada IS NULL");
    return { deleted: 0 };
  } catch (error) {
    console.error("Error deleting all cashbook:", error);
    throw error;
  }
}
