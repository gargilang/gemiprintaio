// Tipe + konstanta bersama untuk halaman POS. Diekstrak dari page.tsx (Fase 6 C2).
// Murni deklaratif — tidak ada state/efek.

export interface User {
  id: string;
  nama_pengguna: string;
  role: string;
}

export interface Customer {
  id: string;
  nama: string;
  member_status: number;
  telepon?: string;
  alamat?: string;
  email?: string;
  kontak_person?: string;
}

export interface UnitPrice {
  id: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_jual: number;
  harga_member: number;
  default_status: number;
  nama_produk_jual?: string | null;
  /** Flag populer manual override (C5). */
  populer_status?: number;
}

export interface Material {
  id: string;
  nama: string;
  butuh_dimensi_status: number;
  frekuensi_terjual: number;
  muncul_di_pos_status?: number;
  kategori_nama?: string;
  unit_prices: UnitPrice[];
  // Flag virtual: true bila material ini adalah proxy untuk entri katalog_maklon
  // (TIDAK ada di tabel barang asli). Dipakai form POS untuk hide finishing/roll.
  _isKatalogMaklon?: boolean;
  _katalogMaklonId?: string;
}

export interface FinishingItem {
  jenis_finishing: string;
  keterangan?: string;
}

export interface BiayaTambahanItem {
  label: string;
  nominal: number;
}

export interface CartItem {
  barang_id: string;
  barang_nama: string;
  nama_produk_jual?: string | null;
  harga_satuan_id: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_satuan: number;
  jumlah: number;
  /** Jumlah lembar/roll untuk barang berdimensi (jumlah m² = jumlah_roll × panjang × lebar). */
  jumlah_roll?: number;
  panjang?: number;
  lebar?: number;
  butuh_dimensi?: boolean;
  useRounding?: boolean;
  selectedRollSize?: number;
  billedPanjang?: number;
  billedLebar?: number;
  subtotalRaw: number;
  /**
   * Original harga_satuan from catalog (or maklon initial input).
   * When user overrides the price, harga_satuan changes but this stays.
   * Used to: show "(override)" badge, support Reset, compute discount/markup.
   */
  originalHargaSatuan?: number;
  finishing?: FinishingItem[];
  /** Biaya tambahan per baris keranjang (ongkir item, biaya pasang, dll). */
  biaya_tambahan?: BiayaTambahanItem[];
  // Maklon (subcontract) line. When set, this cart entry represents work
  // outsourced to a partner shop instead of a regular catalog item.
  tipe_item?: "BARANG" | "MAKLON";
  vendor_subkontrak_id?: string;
  vendor_subkontrak_nama?: string;
  biaya_subkontrak?: number;
  metode_bayar_vendor?: "CASH" | "NET30" | "TRANSFER";
  deskripsi_pekerjaan?: string;
  /** Referensi entri katalog maklon jika baris berasal dari template. */
  katalog_maklon_id?: string;
}

export interface SubkontraktorOption {
  id: string;
  nama_perusahaan: string;
  kontak_person?: string | null;
}

export type POSInitData = {
  customers: Customer[];
  materials: Material[];
  sales: any[];
  subkontraktor: SubkontraktorOption[];
  katalogMaklon?: import("@/lib/services/katalog-maklon-service").KatalogMaklon[];
};

export const EMPTY_POS_INIT: POSInitData = {
  customers: [],
  materials: [],
  sales: [],
  subkontraktor: [],
  katalogMaklon: [],
};

/** Urutan tampilan kategori (selaras dengan kategori_barang bawaan). */
export const KATEGORI_ORDER = [
  "Media Cetak",
  "Kertas",
  "Kertas Foto",
  "Merchandise",
  "Substrat UV",
  "Tinta & Consumables",
  "Finishing",
  "Lain-lain",
];

// Interface baru — satu entri per harga_barang_satuan, siap tampil di grid POS
export interface ProdukJualFlat {
  /** ID dari harga_barang_satuan */
  id: string;
  /** Nama yang tampil di kartu POS: nama_produk_jual jika ada, fallback ke nama_satuan */
  nama: string;
  /** Nama satuan internal (untuk stock deduction) */
  nama_satuan: string;
  nama_produk_jual?: string | null;
  harga_jual: number;
  harga_member: number;
  faktor_konversi: number;
  /** ID barang induk (kosong untuk entri katalog maklon). */
  barang_id?: string;
  /** Nama barang induk — ditampilkan sebagai label sekunder di kartu */
  barang_nama?: string;
  butuh_dimensi_status?: number;
  kategori_nama?: string | null;
  frekuensi_terjual?: number;
  sumber?: "BARANG" | "KATALOG_MAKLON";
  katalog_maklon_id?: string;
  biaya_subkontrak_default?: number;
  vendor_subkontrak_id_default?: string | null;
  metode_bayar_vendor_default?: "CASH" | "NET30" | "TRANSFER";
}
