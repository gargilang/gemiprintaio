import {
  formatLabelKomponenDimensi,
  hitungQtyKomponenDimensiM2,
  isBarangBerdimensi,
} from "../bom-utils";

describe("bom-utils", () => {
  test("hitungQtyKomponenDimensiM2 = roll × panjang × lebar", () => {
    expect(hitungQtyKomponenDimensiM2(2, 3, 1.5)).toBe(9);
  });

  test("isBarangBerdimensi mengenali flag 1/true", () => {
    expect(isBarangBerdimensi(1)).toBe(true);
    expect(isBarangBerdimensi(true)).toBe(true);
    expect(isBarangBerdimensi(0)).toBe(false);
  });

  test("formatLabelKomponenDimensi menampilkan roll dan ukuran", () => {
    expect(
      formatLabelKomponenDimensi({
        jumlah_roll: 1,
        lebar: 2,
        panjang: 3,
        qty: 6,
      }),
    ).toContain("1 roll");
  });

  test("hitungQtyKomponenDimensiM2 dengan jumlahRoll=1 (default BOM B3) = lebar × panjang", () => {
    // B3: 1 X Banner pakai 1 potong 0.5 × 1.7m = 0.85 m² per unit produk jual.
    expect(hitungQtyKomponenDimensiM2(1, 1.7, 0.5)).toBeCloseTo(0.85, 4);
  });
});
