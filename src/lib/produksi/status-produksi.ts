/**
 * Sumber kebenaran tunggal untuk semua status produksi (SPK).
 *
 * Status item dibedakan per jenis: item cetak-sendiri (in-house) vs item
 * maklon (dikerjakan vendor luar). Status order diturunkan otomatis dari
 * status semua itemnya via {@link deriveOrderStatus}.
 *
 * Validasi nilai dilakukan di aplikasi (Zod, lihat src/lib/schemas/produksi.ts);
 * CHECK constraint DB sengaja dilepas agar menambah status cukup edit file ini.
 * Label SELALU ditampilkan ramah manusia (tanpa underscore) di UI.
 */

export type OrderStatus = "MENUNGGU" | "PROSES" | "SELESAI" | "DIBATALKAN";

/** Status item cetak-sendiri, terurut atas (awal) -> bawah (akhir). */
export const STATUS_ITEM_CETAK = [
  "MENUNGGU",
  "TUNGGU_KONFIRMASI",
  "BAHAN_HABIS",
  "PRINTING",
  "FINISHING",
  "SIAP_AMBIL",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Status item maklon (vendor luar), terurut atas -> bawah. */
export const STATUS_ITEM_MAKLON = [
  "MENUNGGU",
  "TUNGGU_KONFIRMASI",
  "BAHAN_HABIS",
  "PESAN_KURIR",
  "TUNGGU_KURIR",
  "SEDANG_DIKIRIM",
  "DIKERJAKAN_VENDOR",
  "SEDANG_DIAMBIL",
  "SIAP_AMBIL",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Status order, terurut. */
export const STATUS_ORDER = [
  "MENUNGGU",
  "PROSES",
  "SELESAI",
  "DIBATALKAN",
] as const;

/** Semua nilai status item yang valid (gabungan cetak ∪ maklon), unik. */
export const SEMUA_STATUS_ITEM: string[] = Array.from(
  new Set<string>([...STATUS_ITEM_CETAK, ...STATUS_ITEM_MAKLON])
);

/** Label tampilan Bahasa Indonesia per kode status. */
const LABEL_STATUS: Record<string, string> = {
  MENUNGGU: "Menunggu",
  TUNGGU_KONFIRMASI: "Tunggu Konfirmasi",
  BAHAN_HABIS: "Bahan Habis",
  PRINTING: "Printing",
  FINISHING: "Finishing",
  PESAN_KURIR: "Pesan Kurir",
  TUNGGU_KURIR: "Tunggu Kurir",
  SEDANG_DIKIRIM: "Sedang Dikirim",
  DIKERJAKAN_VENDOR: "Dikerjakan Vendor",
  SEDANG_DIAMBIL: "Sedang Diambil",
  SIAP_AMBIL: "Siap Diambil",
  SELESAI: "Selesai",
  DIBATALKAN: "Dibatalkan",
  PROSES: "Proses",
};

/** Ubah SCREAMING_SNAKE_CASE -> "Title Case" (fallback tanpa underscore). */
function humanize(kode: string): string {
  return kode
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ");
}

/** Label ramah manusia; selalu tanpa underscore. */
export function labelStatus(kode: string | null | undefined): string {
  if (!kode) return "-";
  return LABEL_STATUS[kode] || humanize(kode);
}

/** Daftar status sesuai jenis item. */
export function daftarStatusUntukItem(item: {
  is_maklon?: boolean | null;
}): readonly string[] {
  return item.is_maklon ? STATUS_ITEM_MAKLON : STATUS_ITEM_CETAK;
}

/** Status terminal (tidak bergerak lagi). */
export function adalahStatusTerminal(kode: string): boolean {
  return kode === "SELESAI" || kode === "DIBATALKAN";
}

/**
 * Turunkan status order dari status semua itemnya.
 * - item DIBATALKAN diabaikan saat menilai selesai/jalan (bukan penghalang)
 * - semua non-batal SELESAI -> SELESAI
 * - tidak ada item non-batal -> DIBATALKAN
 * - ada minimal satu non-batal yang bergerak dari MENUNGGU -> PROSES
 * - selain itu -> MENUNGGU
 */
export function deriveOrderStatus(statuses: string[]): OrderStatus {
  if (statuses.length === 0) return "MENUNGGU";
  const nonBatal = statuses.filter((s) => s !== "DIBATALKAN");
  if (nonBatal.length === 0) return "DIBATALKAN";
  if (nonBatal.every((s) => s === "SELESAI")) return "SELESAI";
  const adaBergerak = nonBatal.some((s) => s !== "MENUNGGU");
  return adaBergerak ? "PROSES" : "MENUNGGU";
}

/** Warna badge per status (Tailwind, dengan pasangan dark mode). */
export function warnaStatus(kode: string): string {
  switch (kode) {
    case "MENUNGGU":
      return "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-300";
    case "PROSES":
      return "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-300";
    case "SELESAI":
      return "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-300";
    case "DIBATALKAN":
      return "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-300";
    case "PRINTING":
      return "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 border-purple-300";
    case "FINISHING":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300";
    case "TUNGGU_KONFIRMASI":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border-amber-300";
    case "BAHAN_HABIS":
      return "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border-rose-300";
    case "PESAN_KURIR":
    case "TUNGGU_KURIR":
      return "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200 border-cyan-300";
    case "SEDANG_DIKIRIM":
    case "SEDANG_DIAMBIL":
      return "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border-sky-300";
    case "DIKERJAKAN_VENDOR":
      return "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200 border-indigo-300";
    case "SIAP_AMBIL":
      return "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border-teal-300";
    default:
      return "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100 border-gray-300";
  }
}
