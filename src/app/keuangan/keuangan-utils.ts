// Helper murni untuk halaman Keuangan. Diekstrak dari page.tsx (Fase 6 C1).
// Tidak ada state/efek — aman dipakai lintas section.

import type { KategoriTransaksi } from "@/types/database";

export { stripReferenceId } from "@/lib/keperluan-display";

export interface KategoriColor {
  bg: string;
  text: string;
  border: string;
}

export interface FinanceCategoryConfig {
  id?: string;
  category_code: string;
  display_name: string;
  color_bg: string;
  color_text: string;
  color_border: string;
  metric_contributions?: unknown;
}

/**
 * Kategori "non-kas" — entri jurnal akuntansi yang TIDAK menggerakkan saldo kas
 * (lihat rumus saldo di `src/lib/ast/defaults.ts`). HPP & pembaliknya mencatat
 * harga pokok untuk perhitungan laba, bukan uang yang benar-benar keluar dari
 * laci (kas sudah keluar saat beli/bayar bahan). Karena membingungkan bila
 * nyempil di daftar buku kas, baris dengan kategori ini disembunyikan dari
 * tampilan ledger — angkanya tetap utuh di database & tetap dihitung di kartu
 * ringkasan (Total Biaya) dan Laporan Laba Rugi.
 *
 * Catatan: penyaringan hanya di tampilan halaman Buku Keuangan. Engine recalc,
 * summary, dan laporan tetap memproses baris ini seperti biasa.
 */
export const KATEGORI_NONKAS: ReadonlySet<string> = new Set([
  "HPP",
  "RETUR_HPP",
]);

/** Benar bila kategori adalah entri jurnal non-kas (disembunyikan dari ledger). */
export function adalahKategoriNonKas(kode: string | null | undefined): boolean {
  return kode != null && KATEGORI_NONKAS.has(kode);
}

/**
 * Ubah kode kategori (SCREAMING_SNAKE_CASE) jadi label ramah manusia sebagai
 * fallback terakhir bila konfigurasi belum punya `display_name`.
 * Contoh: "PINJAMAN_KARYAWAN" → "Pinjaman Karyawan".
 */
export function humanizeKategoriKode(kode: string): string {
  return kode
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((kata) => kata.charAt(0).toUpperCase() + kata.slice(1))
    .join(" ");
}

/** Palet warna bawaan per kategori, dipakai bila kategori tidak punya warna kustom. */
const FALLBACK_KATEGORI_COLORS: Record<string, KategoriColor> = {
  KAS: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200", border: "border-blue-300" },
  BIAYA: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800", border: "border-red-300" },
  OMZET: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800", border: "border-green-300" },
  INVESTOR: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800", border: "border-purple-300" },
  SUBSIDI: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-800", border: "border-yellow-300" },
  LUNAS: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800", border: "border-teal-300" },
  SUPPLY: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800", border: "border-orange-300" },
  HPP: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300" },
  LABA: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800", border: "border-emerald-300" },
  KOMISI: { bg: "bg-cyan-100 dark:bg-cyan-900/30", text: "text-cyan-800", border: "border-cyan-300" },
  TABUNGAN: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-800", border: "border-indigo-300" },
  HUTANG: { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" },
  PIUTANG: { bg: "bg-lime-100", text: "text-lime-800", border: "border-lime-300" },
};

const DEFAULT_KATEGORI_COLOR: KategoriColor = {
  bg: "bg-gray-100 dark:bg-slate-800",
  text: "text-gray-800 dark:text-slate-100",
  border: "border-gray-300",
};

/**
 * Tentukan warna badge kategori: pakai warna kustom dari konfigurasi bila ada,
 * jika tidak jatuh ke palet bawaan, lalu ke warna abu-abu default.
 */
export function resolveKategoriColor(
  kategori: KategoriTransaksi | string,
  financeCategories: FinanceCategoryConfig[]
): KategoriColor {
  const dynamicCategory = financeCategories.find(
    (item) => item.category_code === kategori
  );
  if (dynamicCategory) {
    return {
      bg: dynamicCategory.color_bg,
      text: dynamicCategory.color_text,
      border: dynamicCategory.color_border,
    };
  }
  return FALLBACK_KATEGORI_COLORS[kategori] || DEFAULT_KATEGORI_COLOR;
}
