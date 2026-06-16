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
  if (entry.keperluan?.includes("[REF:purchase-")) {
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

// ============================================================================
// CSV IMPORT
// ============================================================================

const ALLOWED_CATEGORIES = new Set([
  "KAS",
  "BIAYA",
  "OMZET",
  "INVESTOR",
  "SUBSIDI",
  "LUNAS",
  "SUPPLY",
  "LABA",
  "KOMISI",
  "TABUNGAN",
  "HUTANG",
  "PIUTANG",
  "MAKLON",
]);

function normalizeCategory(raw: any): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;
  v = v.toUpperCase().replace(/\s+/g, "-").replace(/[–—]/g, "-");
  return ALLOWED_CATEGORIES.has(v) ? v : null;
}

function toNumber(raw: any): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return raw;
  let v = String(raw).trim();

  // Hapus prefix mata uang (Rp, IDR, dll.)
  v = v.replace(/^(Rp|IDR|rp)\s*/i, "");
  v = v.replace(/\s+/g, "");

  const commaCount = (v.match(/,/g) || []).length;
  const dotCount = (v.match(/\./g) || []).length;

  if (commaCount > 1) {
    // Banyak koma = format AS (5,085,464)
    v = v.replace(/,/g, "");
  } else if (dotCount > 1) {
    // Banyak titik = format Indonesia (5.085.464 atau 5.085.464,50)
    v = v.replace(/\./g, "");
    if (commaCount === 1) {
      v = v.replace(/,/g, ".");
    }
  } else if (commaCount === 1 && dotCount === 1) {
    const commaPos = v.indexOf(",");
    const dotPos = v.indexOf(".");
    if (dotPos > commaPos) {
      // Format: 1,234.56
      v = v.replace(/,/g, "");
    } else {
      // Format: 1.234,56
      v = v.replace(/\./g, "");
      v = v.replace(/,/g, ".");
    }
  } else if (commaCount === 1 && dotCount === 0) {
    const parts = v.split(",");
    if (parts[1] && parts[1].length <= 2) {
      v = v.replace(/,/g, ".");
    } else {
      v = v.replace(/,/g, "");
    }
  } else if (commaCount === 0 && dotCount === 1) {
    const parts = v.split(".");
    if (parts[1] && parts[1].length === 3) {
      v = v.replace(/\./g, "");
    }
  }

  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(raw: any): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Coba ISO dulu (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Coba parse tanggal yang dipisah slash atau strip
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    let [_, p1, p2, year] = parts;

    if (year.length === 2) {
      year = (Number(year) >= 50 ? "19" : "20") + year;
    }

    let month, day;
    if (Number(p1) > 12) {
      day = p1;
      month = p2;
    } else if (Number(p2) > 12) {
      month = p1;
      day = p2;
    } else {
      // Default ke MM/DD/YYYY (format Google Sheets)
      month = p1;
      day = p2;
    }

    const mm = month.padStart(2, "0");
    const dd = day.padStart(2, "0");

    const testDate = new Date(`${year}-${mm}-${dd}`);
    if (isNaN(testDate.getTime())) {
      return null;
    }

    return `${year}-${mm}-${dd}`;
  }

  return null;
}

/**
 * Impor buku kas dari CSV
 * @param csvText Konten CSV sebagai string
 * @param append Apakah menambahkan ke data yang ada atau menggantinya
 * @returns Hasil impor dengan jumlah
 */
export async function importCashbookFromCSV(
  csvText: string,
  append: boolean = false,
): Promise<{
  success: boolean;
  imported: number;
  skipped: number;
  message: string;
  errors?: string[];
}> {
  try {
    // Impor parser CSV secara dinamis (hanya kalau diperlukan di sisi klien)
    // Untuk sekarang, kita pakai parser CSV sederhana
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length === 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        message: "File CSV kosong",
      };
    }

    // Parse header
    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h) => h.trim().toUpperCase());

    // Cek kolom yang wajib ada
    const requiredColumns = ["TANGGAL", "KATEGORI", "DEBIT", "KREDIT"];
    const missingColumns = requiredColumns.filter(
      (col) => !headers.includes(col),
    );

    if (missingColumns.length > 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        message: `Kolom wajib hilang: ${missingColumns.join(", ")}`,
      };
    }

    // Ambil indeks kolom
    const tanggalIdx = headers.indexOf("TANGGAL");
    const kategoriIdx = headers.indexOf("KATEGORI");
    const debitIdx = headers.indexOf("DEBIT");
    const kreditIdx = headers.indexOf("KREDIT");
    const keperluanIdx = headers.indexOf("KEPERLUAN");

    // Hapus data yang ada kalau tidak append
    if (!append) {
      await deleteAllCashbook();
    }

    // Ambil urutan_tampilan tertinggi untuk lanjut penomoran
    let nextDisplayOrder = await nextUrutanTampilanKeuangan();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Proses baris data
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parsing CSV sederhana (menangani nilai dalam tanda kutip)
      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      // Parse nilai
      const tanggal = parseDate(values[tanggalIdx]);
      const kategori = normalizeCategory(values[kategoriIdx]);
      const debit = toNumber(values[debitIdx]);
      const kredit = toNumber(values[kreditIdx]);
      const keperluan =
        keperluanIdx !== -1 ? values[keperluanIdx]?.trim() || "" : "";

      // Validasi
      if (!tanggal) {
        skipped++;
        errors.push(`Baris ${i + 1}: Tanggal tidak valid`);
        continue;
      }
      if (!kategori) {
        skipped++;
        errors.push(`Baris ${i + 1}: Kategori tidak valid`);
        continue;
      }

      // Sisipkan record
      try {
        const id = `cb-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        await db.insert("keuangan", {
          id,
          tanggal,
          kategori_transaksi: kategori,
          debit,
          kredit,
          keperluan,
          urutan_tampilan: nextDisplayOrder,
          omzet: 0,
          biaya_operasional: 0,
          biaya_bahan: 0,
          saldo: 0,
          laba_bersih: 0,
        });

        nextDisplayOrder++;
        imported++;
      } catch (error) {
        skipped++;
        errors.push(
          `Baris ${i + 1}: ${
            error instanceof Error ? error.message : "Gagal menyisipkan"
          }`,
        );
      }
    }

    await recalculateCashbookIfAvailable();

    return {
      success: true,
      imported,
      skipped,
      message: `Berhasil mengimpor ${imported} record${
        skipped > 0 ? ` (${skipped} dilewati)` : ""
      }`,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("Kesalahan impor CSV:", error);
    return {
      success: false,
      imported: 0,
      skipped: 0,
      message: error instanceof Error ? error.message : "Gagal mengimpor CSV",
    };
  }
}
