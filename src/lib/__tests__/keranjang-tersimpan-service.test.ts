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
  parkCart,
  listParkedCarts,
  loadParkedCart,
  deleteParkedCart,
  markFinal,
} from "../services/keranjang-tersimpan-service";

describe("keranjang-tersimpan-service", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("parkir menyimpan cart_snapshot dan set kedaluwarsa 30 hari", async () => {
    const r = await parkCart(
      {
        label: "Budi · 2 item · 14:30",
        prioritas: "NORMAL",
        cart_snapshot: [{ barang_nama: "X", jumlah: 1, harga_satuan: 1000 }],
      },
      "kasir-1"
    );
    expect(r.id).toBeTruthy();
    expect(r.status).toBe("AKTIF");
    expect(r.kedaluwarsa_pada).toBeTruthy();
    const all = await listParkedCarts();
    expect(all).toHaveLength(1);
  });

  it("load mengembalikan cart_snapshot utuh", async () => {
    const r = await parkCart(
      {
        label: "L",
        prioritas: "NORMAL",
        cart_snapshot: [
          { a: 1, tipe_item: "MAKLON", vendor_subkontrak_id: "v1", biaya_subkontrak: 5 },
        ],
      },
      "u"
    );
    const loaded = await loadParkedCart(r.id);
    expect(loaded?.cart_snapshot).toEqual([
      { a: 1, tipe_item: "MAKLON", vendor_subkontrak_id: "v1", biaya_subkontrak: 5 },
    ]);
  });

  it("markFinal set status FINAL", async () => {
    const r = await parkCart({ label: "L", prioritas: "NORMAL", cart_snapshot: [] }, "u");
    await markFinal(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });

  it("delete soft-delete", async () => {
    const r = await parkCart({ label: "L", prioritas: "NORMAL", cart_snapshot: [] }, "u");
    await deleteParkedCart(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });
});
