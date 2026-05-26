/**
 * Stock opname service tests.
 *
 * Coverage:
 *   - createStockOpname snapshots tracked materials' system_qty
 *   - updateStockOpnameCounts computes delta_qty / delta_value
 *   - postStockOpname creates ADJUSTMENT movement only for non-zero deltas
 *   - cancel only allowed in DRAFT
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

const getMaterialsMock = jest.fn();
jest.mock("@/lib/services/materials-service", () => ({
  __esModule: true,
  getMaterials: (...args: any[]) => getMaterialsMock(...args),
}));

const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
}));

import {
  cancelStockOpname,
  createStockOpname,
  postStockOpname,
  updateStockOpnameCounts,
} from "../services/stock-opname-service";

beforeEach(() => {
  resetMockDb();
  postInventoryMovementMock
    .mockReset()
    .mockImplementation(async (input) => ({ id: `mov-${input.source_line_id}`, ...input }));
  getMaterialsMock.mockReset().mockResolvedValue([
    { id: "barang-1", nama: "Tinta", jumlah_stok: 100, average_cost_per_base_unit: 1000, lacak_inventori_status: 1 },
    { id: "barang-2", nama: "Kertas", jumlah_stok: 25, average_cost_per_base_unit: 2000, lacak_inventori_status: 1 },
    { id: "barang-3", nama: "Service tag", jumlah_stok: 0, average_cost_per_base_unit: 0, lacak_inventori_status: 0 },
  ]);
});

describe("stock-opname-service", () => {
  it("createStockOpname snapshots tracked materials only", async () => {
    const result = await createStockOpname({ tanggal: "2026-05-25" });
    expect(result.nomor_opname).toBe("SO-20260525-001");
    const items = Array.from(mockTable("stock_opname_items").values());
    expect(items).toHaveLength(2);
    expect(items.find((it) => it.barang_id === "barang-3")).toBeUndefined();
    const headers = Array.from(mockTable("stock_opnames").values());
    expect(headers[0].status).toBe("DRAFT");
    expect(headers[0].total_items).toBe(2);
  });

  it("updateStockOpnameCounts computes delta and persists totals", async () => {
    await createStockOpname({ tanggal: "2026-05-25" });
    const session = Array.from(mockTable("stock_opnames").values())[0];
    const items = Array.from(mockTable("stock_opname_items").values()).filter(
      (it) => it.stock_opname_id === session.id
    );
    const tinta = items.find((it) => it.barang_id === "barang-1")!;
    const kertas = items.find((it) => it.barang_id === "barang-2")!;

    await updateStockOpnameCounts(session.id, [
      { stock_opname_item_id: tinta.id, counted_qty: 95 }, // -5 * 1000 = -5000
      { stock_opname_item_id: kertas.id, counted_qty: 30 }, // +5 * 2000 = +10000
    ]);

    const refreshedHeader = mockTable("stock_opnames").get(session.id)!;
    expect(refreshedHeader.total_delta_qty).toBe(0); // -5 + 5
    expect(refreshedHeader.total_delta_value).toBe(5000); // -5000 + 10000
    expect(mockTable("stock_opname_items").get(tinta.id)!.delta_qty).toBe(-5);
    expect(mockTable("stock_opname_items").get(kertas.id)!.delta_qty).toBe(5);
  });

  it("postStockOpname creates ADJUSTMENT movement only for non-zero deltas", async () => {
    await createStockOpname({ tanggal: "2026-05-25" });
    const session = Array.from(mockTable("stock_opnames").values())[0];
    const items = Array.from(mockTable("stock_opname_items").values()).filter(
      (it) => it.stock_opname_id === session.id
    );
    const tinta = items.find((it) => it.barang_id === "barang-1")!;
    const kertas = items.find((it) => it.barang_id === "barang-2")!;

    // tinta delta = -3, kertas delta = 0 → only tinta should produce a movement.
    await updateStockOpnameCounts(session.id, [
      { stock_opname_item_id: tinta.id, counted_qty: 97 },
      { stock_opname_item_id: kertas.id, counted_qty: 25 },
    ]);
    await postStockOpname(session.id);

    expect(postInventoryMovementMock).toHaveBeenCalledTimes(1);
    expect(postInventoryMovementMock.mock.calls[0][0]).toMatchObject({
      movement_type: "ADJUSTMENT",
      source_type: "STOCK_OPNAME",
      source_id: session.id,
      qty_delta: -3,
    });
    expect(mockTable("stock_opnames").get(session.id)!.status).toBe("POSTED");
  });

  it("rejects post on already posted opname", async () => {
    await createStockOpname({ tanggal: "2026-05-25" });
    const session = Array.from(mockTable("stock_opnames").values())[0];
    await postStockOpname(session.id);
    await expect(postStockOpname(session.id)).rejects.toThrow(/diposting|batal/);
  });

  it("cancel only allowed on DRAFT", async () => {
    await createStockOpname({ tanggal: "2026-05-25" });
    const session = Array.from(mockTable("stock_opnames").values())[0];
    await cancelStockOpname(session.id);
    expect(mockTable("stock_opnames").get(session.id)!.status).toBe("CANCELLED");
    await expect(cancelStockOpname(session.id)).rejects.toThrow(/DRAFT/);
  });
});
