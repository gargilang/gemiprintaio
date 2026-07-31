import "server-only";

import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";

/**
 * Accounting period management.
 *
 * Setiap bulan = 1 row di accounting_periods. Saat owner percetakan tutup
 * pembukuan periode (mis. setelah lapor pajak), dia close periode tersebut
 * supaya tidak ada yang bisa void/adjust transaksi di bulan itu lagi.
 *
 * RPC void/adjustment/waste/retur sudah panggil `assert_period_open()` di
 * Postgres, jadi check otomatis di sisi server. Service ini hanya untuk
 * UI dan listing.
 */

export interface AccountingPeriod {
  id: string;
  period_key: string; // YYYY-MM
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED";
  closed_at?: string | null;
  closed_by?: string | null;
  catatan?: string | null;
  dibuat_pada?: string;
  diperbarui_pada?: string;
}

function periodBounds(year: number, month: number): { start: string; end: string; key: string } {
  const padM = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${padM}-01`,
    end: `${year}-${padM}-${String(lastDay).padStart(2, "0")}`,
    key: `${year}-${padM}`,
  };
}

export async function listAccountingPeriods(): Promise<AccountingPeriod[]> {
  const result = await db.query<AccountingPeriod>("accounting_periods", {
    orderBy: { column: "period_key", ascending: false },
    limit: 60,
  });
  if (result.error) throw result.error;
  return result.data || [];
}

/**
 * Ambil periode yang sudah ada untuk tahun+bulan tertentu, tanpa membuat baru.
 * Kembalikan `null` jika belum ada. Gunakan ini untuk endpoint read-only
 * (mis. summary, laporan) agar tidak mencemari tabel dengan periode masa depan.
 */
export async function getPeriodIfExists(
  year: number,
  month: number
): Promise<AccountingPeriod | null> {
  const { key } = periodBounds(year, month);
  const existing = await db.queryOne<AccountingPeriod>("accounting_periods", {
    where: { period_key: key },
  });
  return existing.data ?? null;
}

export async function getOrCreatePeriod(
  year: number,
  month: number
): Promise<AccountingPeriod> {
  const { start, end, key } = periodBounds(year, month);
  const existing = await db.queryOne<AccountingPeriod>("accounting_periods", {
    where: { period_key: key },
  });
  if (existing.data) return existing.data;
  const row: AccountingPeriod = {
    id: generateId(),
    period_key: key,
    start_date: start,
    end_date: end,
    status: "OPEN",
    dibuat_pada: getCurrentTimestamp(),
    diperbarui_pada: getCurrentTimestamp(),
  };
  const ins = await db.insert("accounting_periods", row);
  if (ins.error) throw ins.error;
  return row;
}

export async function closePeriod(input: {
  year: number;
  month: number;
  actor_id?: string | null;
  catatan?: string | null;
}): Promise<AccountingPeriod> {
  const period = await getOrCreatePeriod(input.year, input.month);
  if (period.status === "CLOSED") {
    throw new Error(`Periode ${period.period_key} sudah ditutup`);
  }
  const upd = await db.update("accounting_periods", period.id, {
    status: "CLOSED",
    closed_at: getCurrentTimestamp(),
    closed_by: input.actor_id || null,
    catatan: input.catatan?.trim() || null,
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
  return { ...period, status: "CLOSED" };
}

export async function reopenPeriod(input: {
  year: number;
  month: number;
  alasan: string;
}): Promise<AccountingPeriod> {
  if (!input.alasan?.trim()) {
    throw new Error("Alasan buka kembali wajib diisi");
  }
  const period = await getOrCreatePeriod(input.year, input.month);
  if (period.status === "OPEN") {
    throw new Error(`Periode ${period.period_key} sudah dalam status OPEN`);
  }
  const upd = await db.update("accounting_periods", period.id, {
    status: "OPEN",
    closed_at: null,
    closed_by: null,
    catatan: `${period.catatan || ""} | Re-opened: ${input.alasan.trim()}`.trim(),
    diperbarui_pada: getCurrentTimestamp(),
  });
  if (upd.error) throw upd.error;
  return { ...period, status: "OPEN" };
}

/**
 * Quick check apakah tanggal tertentu jatuh di periode CLOSED. Dipakai
 * di service path SQLite/Tauri (di Postgres sudah di-handle oleh
 * `assert_period_open` di RPC). Untuk web path yang panggil RPC tidak
 * perlu re-check di TS.
 */
export async function isDateInClosedPeriod(date: string): Promise<boolean> {
  const dateOnly = String(date).split("T")[0];
  const key = dateOnly.slice(0, 7); // YYYY-MM
  const r = await db.queryOne<AccountingPeriod>("accounting_periods", {
    where: { period_key: key },
  });
  return r.data?.status === "CLOSED";
}

/** Nama bulan dalam Bahasa Indonesia — index 1-based (indeks 0 = string kosong). */
const NAMA_BULAN = [
  "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatPeriodLabel(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return `${NAMA_BULAN[month] ?? String(month)} ${year}`;
}

/** Ambil tahun dan bulan berjalan menurut timezone Jakarta. */
function getJakartaYearMonth(now = new Date()): { year: number; month: number } {
  const jakartaDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(now);
  const [year, month] = jakartaDate.split("-").map(Number);
  return { year, month };
}

/**
 * Ambil atau buat periode OPEN mulai dari bulan tertentu.
 * Bila bulan tersebut sudah CLOSED, lanjut ke bulan berikutnya (setelah tutup buku).
 */
async function ensureOpenPeriodStartingAt(
  year: number,
  month: number
): Promise<AccountingPeriod> {
  let y = year;
  let m = month;
  for (let attempt = 0; attempt < 24; attempt++) {
    const period = await getOrCreatePeriod(y, m);
    if (period.status === "OPEN") return period;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  throw new Error("Tidak ditemukan periode OPEN yang tersedia");
}

export async function getOrCreateOpenPeriod(): Promise<AccountingPeriod> {
  const result = await db.query<AccountingPeriod>("accounting_periods", {
    where: { status: "OPEN" },
    orderBy: { column: "period_key", ascending: false },
    limit: 1,
  });
  if (result.error) throw result.error;
  if (result.data?.length) return result.data[0];

  const { year, month } = getJakartaYearMonth();
  return ensureOpenPeriodStartingAt(year, month);
}
