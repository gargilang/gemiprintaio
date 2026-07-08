/**
 * Helper qty/satuan untuk cetak faktur, struk penjualan, dan SPK.
 *
 * Barang berdimensi:
 * - UKURAN = panjang × lebar (meter) sesuai input
 * - QTY = jumlah lembar/banner yang dicetak (bukan total m²)
 */

import type { FakturItem } from "@/lib/faktur-print";

export type ItemCetakPenjualan = {
  jumlah: number;
  nama_satuan?: string;
  panjang?: number | null;
  lebar?: number | null;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
  jumlah_roll?: number | null;
  jumlah_lembar?: number | null;
  harga_satuan?: number;
  subtotal?: number;
};

function positive(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function formatUkuranPerPcs(
  panjang: number | null | undefined,
  lebar: number | null | undefined,
): string {
  const p = positive(panjang);
  const l = positive(lebar);
  if (!p || !l) return "";
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
  return `${fmt(p)} × ${fmt(l)} m`;
}

function formatAngkaQty(qty: number): string {
  return Number.isInteger(qty)
    ? String(qty)
    : qty.toFixed(2).replace(/\.?0+$/, "");
}

/** Ukuran input (meter) untuk kolom UKURAN / baris dimensi. */
export function formatUkuranCetakInput(
  item: Pick<ItemCetakPenjualan, "panjang" | "lebar">,
): string | undefined {
  const ukuran = formatUkuranPerPcs(item.panjang, item.lebar);
  return ukuran || undefined;
}

/**
 * Jumlah lembar/banner untuk kolom QTY (bukan m²).
 * `jumlah` di DB/keranjang = total m²; qty cetak = jumlah_roll atau jumlah ÷ luas.
 */
export function hitungQtyLembarCetakPenjualan(
  item: ItemCetakPenjualan,
): number | null {
  const panjang = positive(item.panjang) || positive(item.billed_panjang);
  const lebar = positive(item.lebar) || positive(item.billed_lebar);
  if (!panjang || !lebar) return null;

  if (item.jumlah_roll != null) {
    return Math.max(1, Math.round(Number(item.jumlah_roll)));
  }
  if (item.jumlah_lembar != null) {
    return Math.max(1, Math.round(Number(item.jumlah_lembar)));
  }

  const pieceArea = panjang * lebar;
  const stored = positive(item.jumlah);
  if (stored >= pieceArea - 0.001) {
    const pieces = Math.round(stored / pieceArea);
    return pieces >= 1 ? pieces : 1;
  }
  if (stored >= 1 && Math.abs(stored - Math.round(stored)) < 0.001) {
    return Math.round(stored);
  }
  return 1;
}

/** Total m² (billing/inventori) — bukan untuk kolom QTY cetak. */
export function hitungQtyM2CetakPenjualan(
  item: ItemCetakPenjualan,
): number | null {
  const panjang = positive(item.billed_panjang) || positive(item.panjang);
  const lebar = positive(item.billed_lebar) || positive(item.lebar);
  if (!panjang || !lebar) return null;

  const lembar = hitungQtyLembarCetakPenjualan(item);
  if (lembar != null) {
    return panjang * lebar * lembar;
  }
  return positive(item.jumlah) || null;
}

/** Qty + satuan untuk kolom QTY cetak. */
export function qtySatuanCetakPenjualan(item: ItemCetakPenjualan): {
  qty: number;
  satuan: string;
} {
  const lembar = hitungQtyLembarCetakPenjualan(item);
  if (lembar != null) {
    return { qty: lembar, satuan: "" };
  }
  return {
    qty: Number(item.jumlah) || 0,
    satuan: item.nama_satuan?.trim() || "",
  };
}

/** Baris ukuran di struk 80mm (meter sesuai input). */
export function formatDimensiBarisThermal(
  item: ItemCetakPenjualan,
): string | undefined {
  return formatUkuranCetakInput(item);
}

/** Map baris penjualan / keranjang ke format tabel faktur A4. */
export function mapPenjualanItemKeFaktur(item: {
  barang_nama?: string;
  nama_produk_jual?: string | null;
  barang_id?: string;
  deskripsi_pekerjaan?: string | null;
  tipe_item?: string;
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
  jumlah_roll?: number | null;
  harga_satuan: number;
  subtotal?: number;
  biaya_tambahan?: Array<{ label: string; nominal: number }>;
}): FakturItem {
  const { qty, satuan } = qtySatuanCetakPenjualan(item);
  const subtotal = Number(item.subtotal) || 0;
  const harga =
    qty > 0 && subtotal > 0 ? subtotal / qty : Number(item.harga_satuan || 0);
  const nama =
    item.tipe_item === "MAKLON" && item.deskripsi_pekerjaan
      ? item.deskripsi_pekerjaan
      : item.nama_produk_jual?.trim() ||
        item.barang_nama ||
        item.barang_id ||
        "—";

  return {
    nama,
    ukuran: formatUkuranCetakInput(item) ?? "",
    qty,
    satuan,
    harga,
    jumlah: subtotal || qty * harga,
    biaya_tambahan: item.biaya_tambahan,
  };
}

/** Input cetak dari baris item produksi / SPK. */
export type ItemSpkLike = {
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  billed_panjang?: number | null;
  billed_lebar?: number | null;
};

export function toCetakInputSpk(item: ItemSpkLike): ItemCetakPenjualan {
  const lembar = hitungQtyLembarCetakPenjualan({
    jumlah: item.jumlah,
    panjang: item.panjang,
    lebar: item.lebar,
    billed_panjang: item.billed_panjang,
    billed_lebar: item.billed_lebar,
  });
  return {
    jumlah: item.jumlah,
    nama_satuan: item.nama_satuan,
    panjang: item.panjang,
    lebar: item.lebar,
    billed_panjang: item.billed_panjang,
    billed_lebar: item.billed_lebar,
    jumlah_roll: lembar ?? undefined,
  };
}

/** Label qty SPK / produksi: jumlah lembar dicetak. */
export function formatTampilanQtySpk(item: ItemSpkLike): string {
  const { qty, satuan } = qtySatuanCetakPenjualan(toCetakInputSpk(item));
  const label = formatAngkaQty(qty);
  return satuan ? `${label} ${satuan}` : label;
}

/** Ukuran SPK (meter sesuai input). */
export function formatTampilanDimensiSpk(
  item: ItemSpkLike,
): string | undefined {
  return formatUkuranCetakInput(item);
}

/** Ukuran per keping (alias). */
export function formatUkuranPerKepingSpk(
  item: ItemSpkLike,
): string | undefined {
  return formatUkuranCetakInput(item);
}
