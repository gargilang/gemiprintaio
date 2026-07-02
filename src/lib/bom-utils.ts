/** Util komponen rakitan (BOM) — hitung kebutuhan stok barang berdimensi. */

export function hitungQtyKomponenDimensiM2(
  jumlahRoll: number,
  panjang: number,
  lebar: number
): number {
  const rolls = Math.max(1, Math.round(jumlahRoll));
  const p = Number(panjang);
  const l = Number(lebar);
  if (!Number.isFinite(p) || !Number.isFinite(l) || p <= 0 || l <= 0) {
    return 0;
  }
  return rolls * p * l;
}

export function isBarangBerdimensi(
  butuhDimensiStatus: boolean | number | null | undefined
): boolean {
  return butuhDimensiStatus === true || butuhDimensiStatus === 1;
}

export function formatLabelKomponenDimensi(row: {
  jumlah_roll?: number | null;
  panjang?: number | null;
  lebar?: number | null;
  qty?: number | null;
}): string | null {
  const rolls = row.jumlah_roll != null ? Number(row.jumlah_roll) : null;
  const panjang = row.panjang != null ? Number(row.panjang) : null;
  const lebar = row.lebar != null ? Number(row.lebar) : null;
  if (
    rolls == null ||
    panjang == null ||
    lebar == null ||
    !Number.isFinite(rolls) ||
    !Number.isFinite(panjang) ||
    !Number.isFinite(lebar) ||
    panjang <= 0 ||
    lebar <= 0
  ) {
    return null;
  }
  const m2 = hitungQtyKomponenDimensiM2(rolls, panjang, lebar);
  return `${rolls} roll · ${lebar}×${panjang} m (${m2.toLocaleString("id-ID", { maximumFractionDigits: 4 })} m²)`;
}
