import {
  findDuplicateNamaProduk,
  getKunciNamaProdukEfektif,
  getNamaProdukEfektif,
} from "../barang-unit-utils";

describe("barang-unit-utils — nama produk efektif", () => {
  it("menggunakan nama_produk_jual jika diisi", () => {
    expect(
      getNamaProdukEfektif({
        nama_produk_jual: "Print A4 BW",
        nama_satuan: "lembar",
      }),
    ).toBe("Print A4 BW");
  });

  it("fallback ke nama_satuan jika nama_produk_jual kosong", () => {
    expect(
      getNamaProdukEfektif({
        nama_produk_jual: "",
        nama_satuan: "lembar",
      }),
    ).toBe("lembar");
  });

  it("mendeteksi duplikat berdasarkan nama efektif, bukan satuan", () => {
    const duplicate = findDuplicateNamaProduk([
      { nama_produk_jual: "Print A4 BW", nama_satuan: "lembar" },
      { nama_produk_jual: "Print A4 Color", nama_satuan: "lembar" },
      { nama_produk_jual: "Print A4 BW", nama_satuan: "pcs" },
    ]);
    expect(duplicate).toBe("Print A4 BW");
  });

  it("mengizinkan satuan sama jika nama produk berbeda", () => {
    const duplicate = findDuplicateNamaProduk([
      { nama_produk_jual: "Print A4 BW", nama_satuan: "lembar" },
      { nama_produk_jual: "Print A4 Color", nama_satuan: "lembar" },
    ]);
    expect(duplicate).toBeNull();
  });

  it("membandingkan nama tanpa membedakan huruf besar/kecil", () => {
    expect(
      getKunciNamaProdukEfektif({
        nama_produk_jual: "Print Banner",
        nama_satuan: "m²",
      }),
    ).toBe(
      getKunciNamaProdukEfektif({
        nama_produk_jual: "print banner",
        nama_satuan: "m²",
      }),
    );
  });
});
