/**
 * Helper tampilan item dokumen (PO, penawaran, faktur penjualan) — UI dan cetak.
 */

import { formatUkuranPembelian } from "@/lib/faktur-pembelian-print";
import type { FakturItem } from "@/lib/faktur-print";

export type {
  ItemCetakPenjualan,
  ItemSpkLike,
} from "@/lib/penjualan-cetak-utils";
export {
  formatDimensiBarisThermal,
  formatTampilanDimensiSpk,
  formatTampilanQtySpk,
  formatUkuranCetakInput,
  formatUkuranPerKepingSpk,
  hitungQtyLembarCetakPenjualan,
  hitungQtyM2CetakPenjualan,
  mapPenjualanItemKeFaktur,
  qtySatuanCetakPenjualan,
  toCetakInputSpk,
} from "@/lib/penjualan-cetak-utils";

type ItemDimensi = {
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_roll?: number | null;
  jumlah_lembar?: number | null;
};

/** Catatan internal yang tidak boleh tampil di dokumen untuk vendor/pelanggan. */
export function catatanUntukPihakLuar(
  catatan: string | null | undefined
): string | null {
  const t = catatan?.trim();
  if (!t) return null;
  if (/^Auto-PO\b/i.test(t)) return null;
  return t;
}

/** Label qty untuk tabel PO / penawaran (prioritas roll/lembar + dimensi). */
export function formatTampilanQtyItem(item: ItemDimensi): string {
  const lebar = Number(item.lebar) || 0;
  const panjang = Number(item.panjang) || 0;
  const jumlah = Number(item.jumlah) || 0;

  if (lebar > 0 && panjang > 0) {
    const roll = Math.max(1, Math.round(Number(item.jumlah_roll) || 0));
    const lembar = Math.max(1, Math.round(Number(item.jumlah_lembar) || 0));

    if (item.jumlah_roll && roll > 0) {
      const ukuran = formatUkuranPembelian(panjang, lebar, 1);
      return `${roll} roll · ${ukuran} (= ${jumlah.toFixed(2)} m²)`;
    }
    if (item.jumlah_lembar && lembar > 0) {
      const fmt = (n: number) =>
        Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
      return `${lembar} lbr · ${fmt(lebar)} × ${fmt(panjang)} m (= ${jumlah.toFixed(2)} m²)`;
    }
    const ukuran = formatUkuranPembelian(panjang, lebar, 1);
    if (ukuran) {
      return `${ukuran} (= ${jumlah.toFixed(2)} m²)`;
    }
  }

  const qty =
    Number.isInteger(jumlah) ? String(jumlah) : jumlah.toFixed(2).replace(/\.?0+$/, "");
  return item.nama_satuan ? `${qty} ${item.nama_satuan}` : qty;
}

/** Label qty numerik saja (kolom diterima/sisa — tanpa konversi roll). */
export function formatQtyAngkaItem(item: ItemDimensi, qty: number): string {
  const lebar = Number(item.lebar) || 0;
  const panjang = Number(item.panjang) || 0;
  const amount = Number(qty) || 0;
  if (lebar > 0 && panjang > 0) {
    return `${amount.toFixed(2)} m²`;
  }
  const label =
    Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
  return item.nama_satuan ? `${label} ${item.nama_satuan}` : label;
}

/** Map baris PO ke format tabel faktur (qty roll untuk vendor). */
export function mapPoItemKeFaktur(item: {
  barang_nama?: string;
  barang_id?: string;
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_roll?: number | null;
  harga_satuan: number;
  subtotal?: number;
}): FakturItem {
  const lebar = Number(item.lebar) || 0;
  const panjang = Number(item.panjang) || 0;
  const roll = Math.max(1, Math.round(Number(item.jumlah_roll) || 0));
  const jumlah = Number(item.jumlah) || 0;
  const subtotal = Number(item.subtotal) || jumlah * Number(item.harga_satuan || 0);

  if (lebar > 0 && panjang > 0 && item.jumlah_roll) {
    return {
      nama: item.barang_nama || item.barang_id || "—",
      ukuran: formatUkuranPembelian(panjang, lebar, 1),
      qty: roll,
      satuan: "roll",
      harga: Number(item.harga_satuan || 0),
      jumlah: subtotal,
    };
  }

  return {
    nama: item.barang_nama || item.barang_id || "—",
    ukuran: lebar > 0 && panjang > 0 ? formatUkuranPembelian(panjang, lebar, 1) : "",
    qty: jumlah,
    satuan: item.nama_satuan || "",
    harga: Number(item.harga_satuan || 0),
    jumlah: subtotal,
  };
}

/** Map baris penawaran ke format tabel faktur. */
export function mapPenawaranItemKeFaktur(item: {
  barang_nama?: string;
  barang_id?: string;
  jumlah: number;
  nama_satuan: string;
  panjang?: number | null;
  lebar?: number | null;
  jumlah_lembar?: number | null;
  harga_satuan: number;
  subtotal?: number;
}): FakturItem {
  const lebar = Number(item.lebar) || 0;
  const panjang = Number(item.panjang) || 0;
  const lembar = Math.max(1, Math.round(Number(item.jumlah_lembar) || 0));
  const jumlah = Number(item.jumlah) || 0;
  const subtotal = Number(item.subtotal) || jumlah * Number(item.harga_satuan || 0);

  if (lebar > 0 && panjang > 0 && item.jumlah_lembar) {
    const fmt = (n: number) =>
      Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
    return {
      nama: item.barang_nama || item.barang_id || "—",
      ukuran: `${fmt(lebar)} × ${fmt(panjang)} m`,
      qty: lembar,
      satuan: "lbr",
      harga: Number(item.harga_satuan || 0),
      jumlah: subtotal,
    };
  }

  return {
    nama: item.barang_nama || item.barang_id || "—",
    ukuran: lebar > 0 && panjang > 0 ? formatUkuranPembelian(panjang, lebar, 1) : "",
    qty: jumlah,
    satuan: item.nama_satuan || "",
    harga: Number(item.harga_satuan || 0),
    jumlah: subtotal,
  };
}
