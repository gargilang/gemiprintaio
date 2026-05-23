/**
 * PPN (Pajak Pertambahan Nilai) helpers — sumber kebenaran satu-satunya untuk
 * perhitungan DPP, PPN, dan total. Mirror dari Postgres function
 * `public.hitung_ppn(amount, tarif, metode)` supaya offline (Tauri/SQLite)
 * tetap menghasilkan angka yang sama persis.
 *
 * Tarif diambil per-transaksi (bukan global), karena UU HPP menaikkan tarif
 * secara bertahap dan transaksi historis harus pakai tarif saat penjualan
 * terjadi.
 */
export type PpnMetode = "EKSKLUSIF" | "INKLUSIF";

/**
 * Bulatkan ke 2 desimal supaya konsisten dengan ROUND(...::NUMERIC, 2) di
 * Postgres. Pakai banker's rounding? Tidak — DJP pakai pembulatan biasa,
 * dan Math.round JS juga half-up untuk angka positif.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PpnBreakdown {
  /** Dasar Pengenaan Pajak (sebelum PPN) */
  dpp: number;
  /** Nilai PPN */
  ppn: number;
  /** DPP + PPN — yang ditagih ke pelanggan */
  total: number;
}

/**
 * Hitung DPP + PPN dari nilai transaksi.
 *
 * - EKSKLUSIF: `amount` = DPP. `total` = DPP + PPN. Cocok untuk B2B yang
 *   pasang harga jual sebelum pajak.
 * - INKLUSIF: `amount` = harga akhir (DPP + PPN). DPP di-extract dari total.
 *   Cocok untuk POS retail yang pasang harga rak sudah termasuk PPN.
 */
export function hitungPpn(
  amount: number,
  tarif: number,
  metode: PpnMetode
): PpnBreakdown {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeTarif = Number.isFinite(tarif) && tarif > 0 ? tarif : 0;

  if (safeAmount === 0 || safeTarif <= 0) {
    return { dpp: safeAmount, ppn: 0, total: safeAmount };
  }

  if (metode === "INKLUSIF") {
    const dpp = round2(safeAmount / (1 + safeTarif / 100));
    const ppn = round2(safeAmount - dpp);
    return { dpp, ppn, total: safeAmount };
  }

  const dpp = safeAmount;
  const ppn = round2((safeAmount * safeTarif) / 100);
  return { dpp, ppn, total: dpp + ppn };
}

/**
 * Format NSFP komposit: `010.000-25.00000001` dari potongan-potongan kolom.
 * Aturan format mengikuti Coretax DJP: 16 digit total + dua titik + satu strip.
 *
 * Catatan: 4 digit setelah kode transaksi adalah field administratif yang
 * dipakai DJP untuk legacy serial assignment. Untuk Coretax modern selalu
 * '0.000', jadi kita hardcode di sini.
 */
export function formatNsfpString(
  kodeTransaksi: string | null | undefined,
  tahun: string | null | undefined,
  nomorSeri: string | null | undefined
): string {
  if (!kodeTransaksi || !tahun || !nomorSeri) return "";
  const seri8 = String(nomorSeri).padStart(8, "0");
  return `${kodeTransaksi}0.000-${tahun}.${seri8}`;
}

/**
 * Validasi format NPWP: 15 digit (lama) atau 16 digit (NIK-based per 2024).
 * Tidak strict — kasir kadang ngetik dengan strip/titik. Kita hanya cek
 * jumlah digit setelah strip semua non-digit.
 */
export function isValidNpwp(npwp: string | null | undefined): boolean {
  if (!npwp) return false;
  const digits = npwp.replace(/\D/g, "");
  return digits.length === 15 || digits.length === 16;
}

/**
 * Format NPWP standar: XX.XXX.XXX.X-XXX.XXX (15 digit).
 * Untuk 16 digit (NIK), tampilkan apa adanya.
 */
export function formatNpwp(npwp: string | null | undefined): string {
  if (!npwp) return "";
  const digits = npwp.replace(/\D/g, "");
  if (digits.length === 15) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(
      5,
      8
    )}.${digits.slice(8, 9)}-${digits.slice(9, 12)}.${digits.slice(12, 15)}`;
  }
  return digits;
}
