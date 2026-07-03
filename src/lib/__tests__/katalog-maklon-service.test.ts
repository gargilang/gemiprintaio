import { resetMockDb } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

import {
  createKatalogMaklon,
  deleteKatalogMaklon,
  listKatalogMaklon,
  updateKatalogMaklon,
} from "../services/katalog-maklon-service";

describe("katalog-maklon-service", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("membuat katalog maklon dengan field lengkap", async () => {
    const result = await createKatalogMaklon(
      {
        nama_produk: "Banner Spanduk 3x1",
        nama_satuan: "pcs",
        harga_jual_default: 75000,
        biaya_subkontrak_default: 50000,
        metode_bayar_vendor_default: "CASH",
        is_aktif: 1,
        urutan: 0,
      },
      "user-1"
    );
    expect(result.id).toBeTruthy();
    expect(result.nama_produk).toBe("Banner Spanduk 3x1");

    const all = await listKatalogMaklon();
    expect(all).toHaveLength(1);
    expect(all[0].biaya_subkontrak_default).toBe(50000);
  });

  it("menolak nama_produk duplikat yang aktif", async () => {
    await createKatalogMaklon(
      {
        nama_produk: "X",
        nama_satuan: "pcs",
        harga_jual_default: 1,
        biaya_subkontrak_default: 1,
        metode_bayar_vendor_default: "CASH",
        is_aktif: 1,
        urutan: 0,
      },
      "u"
    );
    await expect(
      createKatalogMaklon(
        {
          nama_produk: "X",
          nama_satuan: "pcs",
          harga_jual_default: 1,
          biaya_subkontrak_default: 1,
          metode_bayar_vendor_default: "CASH",
          is_aktif: 1,
          urutan: 0,
        },
        "u"
      )
    ).rejects.toThrow(/sudah ada/i);
  });

  it("update mengubah field", async () => {
    const created = await createKatalogMaklon(
      {
        nama_produk: "Y",
        nama_satuan: "pcs",
        harga_jual_default: 10,
        biaya_subkontrak_default: 5,
        metode_bayar_vendor_default: "NET30",
        is_aktif: 1,
        urutan: 2,
      },
      "u"
    );
    await updateKatalogMaklon(created.id, {
      nama_produk: "Y2",
      nama_satuan: "lembar",
      harga_jual_default: 12,
      biaya_subkontrak_default: 6,
      metode_bayar_vendor_default: "NET30",
      is_aktif: 1,
      urutan: 2,
    });
    const all = await listKatalogMaklon();
    expect(all[0].nama_produk).toBe("Y2");
    expect(all[0].harga_jual_default).toBe(12);
  });

  it("delete soft-delete dan hilang dari list", async () => {
    const created = await createKatalogMaklon(
      {
        nama_produk: "Z",
        nama_satuan: "pcs",
        harga_jual_default: 1,
        biaya_subkontrak_default: 1,
        metode_bayar_vendor_default: "CASH",
        is_aktif: 1,
        urutan: 0,
      },
      "u"
    );
    await deleteKatalogMaklon(created.id);
    const all = await listKatalogMaklon();
    expect(all).toHaveLength(0);
  });
});
