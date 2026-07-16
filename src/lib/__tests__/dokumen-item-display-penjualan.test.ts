import {
  formatTampilanDimensiSpk,
  formatTampilanQtySpk,
  formatUkuranCetakInput,
  hitungQtyLembarCetakPenjualan,
  hitungQtyM2CetakPenjualan,
  mapPenjualanItemKeFaktur,
  qtySatuanCetakPenjualan,
} from "../penjualan-cetak-utils";

describe("cetak penjualan — qty berdimensi", () => {
  it("QTY = jumlah lembar, bukan m²", () => {
    expect(
      hitungQtyLembarCetakPenjualan({
        jumlah: 30,
        panjang: 2,
        lebar: 3,
        jumlah_roll: 5,
      }),
    ).toBe(5);
    const { qty, satuan } = qtySatuanCetakPenjualan({
      jumlah: 30,
      panjang: 2,
      lebar: 3,
      jumlah_roll: 5,
      nama_satuan: "m²",
    });
    expect(qty).toBe(5);
    expect(satuan).toBe("");
  });

  it("kolom UKURAN memakai meter input", () => {
    expect(formatUkuranCetakInput({ panjang: 2, lebar: 3 })).toBe("3 m × 2 m");
  });

  it("faktur A4: QTY lembar, UKURAN meter, harga per lembar", () => {
    const row = mapPenjualanItemKeFaktur({
      barang_nama: "Flexi Banner",
      jumlah: 30,
      nama_satuan: "m²",
      panjang: 2,
      lebar: 3,
      jumlah_roll: 5,
      harga_satuan: 50_000,
      subtotal: 1_500_000,
    });
    expect(row.qty).toBe(5);
    expect(row.satuan).toBe("");
    expect(row.ukuran).toBe("3 m × 2 m");
    expect(row.harga).toBe(300_000);
    expect(row.jumlah).toBe(1_500_000);
  });

  it("infer lembar dari m² tersimpan (reprint)", () => {
    expect(
      hitungQtyLembarCetakPenjualan({
        jumlah: 30,
        panjang: 2,
        lebar: 3,
      }),
    ).toBe(5);
  });

  it("m² billing terpisah dari QTY cetak", () => {
    expect(
      hitungQtyM2CetakPenjualan({
        jumlah: 30,
        panjang: 2,
        lebar: 3,
        jumlah_roll: 5,
      }),
    ).toBe(30);
  });

  it("barang non-dimensi tetap memakai satuan asli", () => {
    const { qty, satuan } = qtySatuanCetakPenjualan({
      jumlah: 5,
      nama_satuan: "pcs",
    });
    expect(qty).toBe(5);
    expect(satuan).toBe("pcs");
  });
});

describe("tampilan SPK — qty berdimensi", () => {
  it("menampilkan jumlah lembar dan ukuran meter", () => {
    expect(
      formatTampilanQtySpk({
        jumlah: 30,
        nama_satuan: "m²",
        panjang: 2,
        lebar: 3,
      }),
    ).toBe("5");
    expect(
      formatTampilanDimensiSpk({
        jumlah: 30,
        nama_satuan: "m²",
        panjang: 2,
        lebar: 3,
      }),
    ).toBe("3 m × 2 m");
  });
});
