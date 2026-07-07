import { resetMockDb, mockTable } from "./helpers/mock-db";

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
jest.mock("@/lib/auth-guard-server", () => ({
  __esModule: true,
  requireSession: jest.fn(async () => ({ uid: "u1", role: "staff" })),
}));

import { getPopularItemsAction } from "@/app/pos/actions";

beforeEach(() => resetMockDb());

describe("getPopularItemsAction", () => {
  it("auto-compute: barang >= 3 transaksi 30 hari → populer", async () => {
    const recent = new Date().toISOString();
    mockTable("item_penjualan").set("i1", {
      id: "i1",
      tipe_item: "BARANG",
      harga_satuan_id: "up1",
      katalog_maklon_id: null,
      dibuat_pada: recent,
    });
    mockTable("item_penjualan").set("i2", {
      id: "i2",
      tipe_item: "BARANG",
      harga_satuan_id: "up1",
      katalog_maklon_id: null,
      dibuat_pada: recent,
    });
    mockTable("item_penjualan").set("i3", {
      id: "i3",
      tipe_item: "BARANG",
      harga_satuan_id: "up1",
      katalog_maklon_id: null,
      dibuat_pada: recent,
    });
    mockTable("item_penjualan").set("i4", {
      id: "i4",
      tipe_item: "MAKLON",
      harga_satuan_id: null,
      katalog_maklon_id: "km1",
      dibuat_pada: recent,
    });
    const r = await getPopularItemsAction();
    expect(r.barangUnitPriceIds.has("up1")).toBe(true);
    expect(r.katalogMaklonIds.has("km1")).toBe(false); // hanya 1 transaksi < 3
  });

  it("manual override: populer_status=1 selalu populer walau 0 transaksi", async () => {
    mockTable("harga_barang_satuan").set("up9", {
      id: "up9",
      populer_status: 1,
      is_deleted: false,
    });
    mockTable("katalog_maklon").set("km9", {
      id: "km9",
      populer_status: 1,
      is_deleted: 0,
    });
    const r = await getPopularItemsAction();
    expect(r.barangUnitPriceIds.has("up9")).toBe(true);
    expect(r.katalogMaklonIds.has("km9")).toBe(true);
  });

  it("transaksi > 30 hari lalu tidak dihitung", async () => {
    const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    for (let i = 0; i < 5; i++) {
      mockTable("item_penjualan").set(`old-${i}`, {
        id: `old-${i}`,
        tipe_item: "BARANG",
        harga_satuan_id: "up-old",
        katalog_maklon_id: null,
        dibuat_pada: old,
      });
    }
    const r = await getPopularItemsAction();
    expect(r.barangUnitPriceIds.has("up-old")).toBe(false);
  });
});
