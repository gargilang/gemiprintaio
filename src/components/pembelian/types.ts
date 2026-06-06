import { type SplitBatch } from "./split-utils";

// Tipe bersama untuk form pembelian + sub-komponennya (Fase 6 B4).

export interface PurchaseItem {
  id_barang: string;
  nama_barang?: string;
  id_satuan: string;
  nama_satuan?: string;
  faktor_konversi?: number;
  jumlah: number;
  harga_beli: number;
  // Hanya diisi untuk barang dengan butuh_dimensi_status = 1.
  // jumlah lalu diturunkan sebagai jumlah_roll * panjang * lebar (m²).
  panjang?: number | null;
  lebar?: number | null;
  /** Jumlah roll fisik dengan dimensi sama (default 1). */
  jumlah_roll?: number;
  // Opsional: pecah roll lebar ini ke beberapa lebar baru saat penerimaan.
  // Setiap batch = N roll dengan pola potongan yang sama.
  split_enabled?: boolean;
  split_batches?: SplitBatch[];
}

export interface Material {
  id: string;
  nama: string;
  satuan_dasar: string;
  butuh_dimensi_status?: number | boolean;
  unit_prices: {
    id: string;
    nama_satuan: string;
    faktor_konversi: number;
    harga_jual: number;
    harga_beli: number;
    default_status?: number | boolean;
  }[];
}

/** Barang dimensi (roll) bila butuh_dimensi_status = 1/true. */
export function isDimensionalMaterial(material: Material | undefined): boolean {
  if (!material) return false;
  const flag = material.butuh_dimensi_status;
  return flag === 1 || flag === true;
}
