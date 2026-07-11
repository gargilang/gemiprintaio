import {
  formatLabelKomponenDimensi,
  hitungQtyKomponenDimensiM2,
  isBarangBerdimensi,
} from "../bom-utils";

describe("bom-utils", () => {
  test("hitungQtyKomponenDimensiM2 = panjang × lebar (arg roll legacy diabaikan)", () => {
    // jumlah_roll pada komponen BOM adalah kolom DB lama (selalu 1); perhitungan
    // qty m² per unit = panjang × lebar. Faktor roll fisik dipakai di jalur
    // decrement inventori, bukan di qty per-unit BOM.
    expect(hitungQtyKomponenDimensiM2(2, 3, 1.5)).toBeCloseTo(4.5, 4);
    expect(hitungQtyKomponenDimensiM2(1, 3, 1.5)).toBeCloseTo(4.5, 4);
  });

  test("isBarangBerdimensi mengenali flag 1/true", () => {
    expect(isBarangBerdimensi(1)).toBe(true);
    expect(isBarangBerdimensi(true)).toBe(true);
    expect(isBarangBerdimensi(0)).toBe(false);
  });

  test("formatLabelKomponenDimensi menampilkan ukuran lebar×panjang dan luas m²", () => {
    const label = formatLabelKomponenDimensi({
      jumlah_roll: 1,
      lebar: 2,
      panjang: 3,
      qty: 6,
    });
    expect(label).toContain("2×3 m");
    expect(label).toContain("6 m²");
  });

  test("hitungQtyKomponenDimensiM2 dengan jumlahRoll=1 (default BOM B3) = lebar × panjang", () => {
    // B3: 1 X Banner pakai 1 potong 0.5 × 1.7m = 0.85 m² per unit produk jual.
    expect(hitungQtyKomponenDimensiM2(1, 1.7, 0.5)).toBeCloseTo(0.85, 4);
  });
});
