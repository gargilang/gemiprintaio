/** Util komponen rakitan (BOM) — hitung kebutuhan stok barang berdimensi. */

export function hitungQtyKomponenDimensiM2(
  _jumlahRollLegacy: number,
  panjang: number,
  lebar: number,
): number {
  const p = Number(panjang);
  const l = Number(lebar);
  if (!Number.isFinite(p) || !Number.isFinite(l) || p <= 0 || l <= 0) {
    return 0;
  }
  return p * l;
}

export function isBarangBerdimensi(
  butuhDimensiStatus: boolean | number | null | undefined,
): boolean {
  return butuhDimensiStatus === true || butuhDimensiStatus === 1;
}

export function formatLabelKomponenDimensi(row: {
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  qty?: number | null;
}): string | null {
  const panjang = row.panjang != null ? Number(row.panjang) : null;
  const lebar = row.lebar != null ? Number(row.lebar) : null;
  if (
    panjang == null ||
    lebar == null ||
    !Number.isFinite(panjang) ||
    !Number.isFinite(lebar) ||
    panjang <= 0 ||
    lebar <= 0
  ) {
    return null;
  }
  const m2 = hitungQtyKomponenDimensiM2(1, panjang, lebar);
  return `${lebar} m × ${panjang} m (${m2.toLocaleString("id-ID", { maximumFractionDigits: 4 })} m²)`;
}
