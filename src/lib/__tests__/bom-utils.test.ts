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
      })
    ).toContain("1 roll");
  });
});
