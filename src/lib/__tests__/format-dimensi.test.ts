import {
  formatQtyMutasi,
  formatSaldoMutasi,
  formatStokDimensi,
} from "../format-dimensi";

describe("formatQtyMutasi", () => {
  it("menampilkan detail roll jika ada roll_width_m dan linear_delta_m negatif", () => {
    expect(
      formatQtyMutasi({ qty_delta: -67.5, roll_width_m: 1.5, linear_delta_m: -45 })
    ).toBe("−45 m · lebar 1.5 m (= −67.5 m²)");
  });

  it("menampilkan tanda positif untuk penambahan roll", () => {
    expect(
      formatQtyMutasi({ qty_delta: 90, roll_width_m: 1.5, linear_delta_m: 60 })
    ).toBe("+60 m · lebar 1.5 m (= +90 m²)");
  });

  it("membulatkan m² ke 2 desimal", () => {
    const result = formatQtyMutasi({
      qty_delta: -22.5,
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });
    expect(result).toBe("−15 m · lebar 1.5 m (= −22.5 m²)");
  });

  it("menampilkan angka + satuan jika tidak ada data roll", () => {
    expect(formatQtyMutasi({ qty_delta: -10, satuan_dasar: "kg" })).toBe("-10 kg");
  });

  it("menampilkan angka tanpa satuan jika satuan kosong", () => {
    expect(formatQtyMutasi({ qty_delta: 5 })).toBe("5");
  });

  it("mengabaikan roll_width_m jika linear_delta_m null", () => {
    expect(
      formatQtyMutasi({ qty_delta: -10, roll_width_m: 1.5, linear_delta_m: null })
    ).toBe("-10");
  });
});

describe("formatSaldoMutasi", () => {
  it("menambahkan m² untuk barang dimensi", () => {
    expect(formatSaldoMutasi(90, true)).toBe("90 m²");
  });

  it("menampilkan desimal yang dibutuhkan", () => {
    expect(formatSaldoMutasi(67.5, true)).toBe("67.5 m²");
  });

  it("tidak menambahkan satuan untuk barang non-dimensi", () => {
    expect(formatSaldoMutasi(10, false)).toBe("10");
  });
});

describe("formatStokDimensi", () => {
  it("menampilkan breakdown roll jika ada variant dengan stok > 0", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 90,
        butuh_dimensi_status: 1,
        roll_variants: [
          { lebar_m: 1.5, panjang_tersedia_m: 60 },
          { lebar_m: 2, panjang_tersedia_m: 0 },
        ],
      })
    ).toBe("90 m² (1.5m: 60m)");
  });

  it("menampilkan total m² tanpa breakdown jika semua variant nol", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 0,
        butuh_dimensi_status: 1,
        roll_variants: [{ lebar_m: 1.5, panjang_tersedia_m: 0 }],
      })
    ).toBe("0 m²");
  });

  it("menampilkan total m² tanpa breakdown jika roll_variants kosong", () => {
    expect(
      formatStokDimensi({ jumlah_stok: 45, butuh_dimensi_status: 1 })
    ).toBe("45 m²");
  });

  it("menampilkan angka + satuan untuk barang non-dimensi", () => {
    expect(
      formatStokDimensi({ jumlah_stok: 10, butuh_dimensi_status: 0, satuan_dasar: "kg" })
    ).toBe("10 kg");
  });

  it("multiple variants tampil dengan pemisah ·", () => {
    expect(
      formatStokDimensi({
        jumlah_stok: 120,
        butuh_dimensi_status: 1,
        roll_variants: [
          { lebar_m: 1.5, panjang_tersedia_m: 60 },
          { lebar_m: 2, panjang_tersedia_m: 15 },
        ],
      })
    ).toBe("120 m² (1.5m: 60m · 2m: 15m)");
  });
});
