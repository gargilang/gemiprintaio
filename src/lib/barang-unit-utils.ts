/** Util satuan harga barang — referensi konversi/HPP, bukan pilihan "Utama" manual. */

export type UnitPriceLike = {
  id?: string;
  default_status?: boolean | number;
  faktor_konversi?: number | null;
  harga_beli?: number | null;
};

export type ProdukJualLike = {
  nama_produk_jual?: string | null;
  nama_satuan: string;
};

/** Nama tampilan POS: nama produk jual jika diisi, fallback ke satuan. */
export function getNamaProdukEfektif(up: ProdukJualLike): string {
  const custom = up.nama_produk_jual?.trim();
  if (custom) return custom;
  return up.nama_satuan.trim();
}

/** Kunci perbandingan duplikat (case-insensitive). */
export function getKunciNamaProdukEfektif(up: ProdukJualLike): string {
  return getNamaProdukEfektif(up).toLocaleLowerCase("id-ID");
}

/** Kembalikan nama produk duplikat pertama, atau null jika unik. */
export function findDuplicateNamaProduk<T extends ProdukJualLike>(
  unitPrices: T[],
): string | null {
  const seen = new Set<string>();
  for (const up of unitPrices) {
    const key = getKunciNamaProdukEfektif(up);
    if (!key) continue;
    if (seen.has(key)) return getNamaProdukEfektif(up);
    seen.add(key);
  }
  return null;
}

/** Satuan acuan konversi harga: faktor = 1, atau baris pertama. */
export function getReferensiUnitPrice<T extends UnitPriceLike>(
  unitPrices: T[] | null | undefined
): T | null {
  if (!unitPrices?.length) return null;
  return (
    unitPrices.find((up) => Number(up.faktor_konversi) === 1) ?? unitPrices[0]
  );
}

/** HPP per satuan dasar dari baris referensi (untuk tampilan/penilaian stok). */
export function getHppPerSatuanDasar(
  unitPrices: UnitPriceLike[] | null | undefined,
  averageCostPerBaseUnit?: number | null
): number {
  const avg = Number(averageCostPerBaseUnit || 0);
  if (avg > 0) return avg;
  const ref = getReferensiUnitPrice(unitPrices);
  if (!ref) return 0;
  const faktor = Number(ref.faktor_konversi || 0);
  if (faktor <= 0) return 0;
  return Number(ref.harga_beli || 0) / faktor;
}

/** Tetapkan default_status DB (legacy) otomatis — hanya baris referensi = 1. */
export function normalizeDefaultStatusForSave<T extends UnitPriceLike>(
  unitPrices: T[]
): (T & { default_status: boolean })[] {
  const ref = getReferensiUnitPrice(unitPrices);
  const refId = ref && "id" in ref ? ref.id : undefined;
  const refIndex = ref ? unitPrices.indexOf(ref) : 0;
  return unitPrices.map((up, index) => ({
    ...up,
    default_status:
      refId != null && up.id != null
        ? up.id === refId
        : index === (refIndex >= 0 ? refIndex : 0),
  }));
}
