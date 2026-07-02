// Tipe bersama untuk ModalTambahBarang + sub-panelnya (Fase 6 B5).

export interface UnitPrice {
  id?: string;
  nama_satuan: string;
  faktor_konversi: number;
  harga_beli: number;
  harga_jual: number;
  harga_member: number;
  /** Legacy DB — diisi otomatis saat simpan, bukan input pengguna. */
  default_status?: boolean;
  urutan_tampilan?: number;
  nama_produk_jual?: string | null;
}
