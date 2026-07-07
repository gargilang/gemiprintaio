// @jest-environment node
/**
 * Test resolver BOM per produk jual (B2.b).
 */
const mockQuery = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: { query: mockQuery },
}));

import { resolveBomForUnitPrice } from "@/lib/services/bom-service";

beforeEach(() => {
  mockQuery.mockReset();
});

describe("resolveBomForUnitPrice", () => {
  it("mengembalikan scope per-produk-jual jika ada row dengan unit_price_id cocok", async () => {
    mockQuery.mockResolvedValueOnce({
      data: [
        { id: "bk-1", komponen_id: "b-kaki", qty: 1, unit_price_id: "up-xbanner", is_deleted: 0 },
      ],
      error: null,
    });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-xbanner");
    expect(rows).toHaveLength(1);
    expect(rows[0].komponen_id).toBe("b-kaki");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("fallback ke scope barang-level jika scope per-produk-jual kosong", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          { id: "bk-2", komponen_id: "b-umum", qty: 1, unit_price_id: null, is_deleted: 0 },
        ],
        error: null,
      });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-outdoor");
    expect(rows).toHaveLength(1);
    expect(rows[0].komponen_id).toBe("b-umum");
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("unitPriceId null hanya cari scope barang-level", async () => {
    mockQuery.mockResolvedValueOnce({
      data: [{ id: "bk-3", komponen_id: "b-umum", qty: 2, unit_price_id: null, is_deleted: 0 }],
      error: null,
    });
    const rows = await resolveBomForUnitPrice("b-flexi", null);
    expect(rows).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({
        where: expect.objectContaining({ parent_barang_id: "b-flexi", unit_price_id: null }),
      }),
    );
  });

  it("mengembalikan [] jika tidak ada scope per-produk-jual maupun barang-level", async () => {
    mockQuery
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const rows = await resolveBomForUnitPrice("b-flexi", "up-indoor");
    expect(rows).toEqual([]);
  });

  it("tolerasi error query — return []", async () => {
    mockQuery.mockResolvedValueOnce({ data: null, error: new Error("conn down") });
    const rows = await resolveBomForUnitPrice("b-flexi", null);
    expect(rows).toEqual([]);
  });
});
