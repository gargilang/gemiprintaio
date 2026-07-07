import { resetMockDb } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

import {
  createKatalogMaklon,
  listKatalogMaklon,
} from "../services/katalog-maklon-service";
import { mockTable } from "./helpers/mock-db";

beforeEach(() => resetMockDb());

describe("katalog-maklon TRANSFER + kategori_id + populer_status", () => {
  it("menerima metode_bayar_vendor_default = TRANSFER", async () => {
    const r = await createKatalogMaklon(
      {
        nama_produk: "Banner Transfer Test",
        nama_satuan: "pcs",
        harga_jual_default: 50000,
        biaya_subkontrak_default: 30000,
        vendor_subkontrak_id_default: "v1",
        metode_bayar_vendor_default: "TRANSFER",
        kategori_id: "kat-1",
        populer_status: 1,
        is_aktif: 1,
      } as any,
      "uid-1",
    );
    expect(r.metode_bayar_vendor_default).toBe("TRANSFER");
    expect(r.kategori_id).toBe("kat-1");
    expect(r.populer_status).toBe(1);
  });

  it("reject metode bayar invalid via Zod", async () => {
    await expect(
      createKatalogMaklon(
        {
          nama_produk: "X",
          nama_satuan: "pcs",
          harga_jual_default: 1,
          biaya_subkontrak_default: 0,
          metode_bayar_vendor_default: "QRCIS" as any,
        } as any,
        "uid-1",
      ),
    ).rejects.toThrow(/metode|invalid/i);
  });

  it("listKatalogMaklon mengembalikan kategori_nama dari join kategori_id", async () => {
    mockTable("kategori_barang").set("kat-1", { id: "kat-1", nama: "Banner" });
    await createKatalogMaklon(
      {
        nama_produk: "Banner Join",
        nama_satuan: "pcs",
        harga_jual_default: 1000,
        biaya_subkontrak_default: 0,
        kategori_id: "kat-1",
        populer_status: 0,
        is_aktif: 1,
      } as any,
      "u1",
    );
    const list = await listKatalogMaklon(false);
    const found = list.find((k) => k.nama_produk === "Banner Join");
    expect(found?.kategori_id).toBe("kat-1");
    expect(found?.kategori_nama).toBe("Banner");
  });
});
