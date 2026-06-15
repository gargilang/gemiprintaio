/**
 * getProductionOrderById: nested enrichment batched, no per-item N+1.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getRollVariants: jest.fn(),
  postInventoryMovement: jest.fn(),
}));
jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(),
}));

import { getProductionOrderById } from "../services/production-service";

beforeEach(() => resetMockDb());

describe("getProductionOrderById (no per-item N+1)", () => {
  it("enriches items with finishing, operator, saleItem, and consumption in batch", async () => {
    mockTable("order_produksi").set("op1", { id: "op1", penjualan_id: "s1" });
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1", pelanggan_id: "c1" });
    mockTable("pelanggan").set("c1", { id: "c1", nama: "Andi" });
    mockTable("profil").set("u1", { id: "u1", nama_pengguna: "operator1" });
    mockTable("item_produksi").set("ip1", {
      id: "ip1", order_produksi_id: "op1", item_penjualan_id: "si1",
      operator_id: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("item_penjualan").set("si1", { id: "si1", tipe_item: "MAKLON", barang_id: "b1" });
    mockTable("item_finishing").set("if1", {
      id: "if1", item_produksi_id: "ip1", operator_id: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("production_material_consumptions").set("pmc1", {
      id: "pmc1", item_produksi_id: "ip1", status: "POSTED",
    });

    const order = await getProductionOrderById("op1");
    expect(order).not.toBeNull();
    expect(order!.nomor_faktur).toBe("INV-1");
    const item = order!.items![0]!;
    expect(item.operator_nama).toBe("operator1");
    expect(item.is_maklon).toBe(true);
    expect(item.finishing![0]!.operator_nama).toBe("operator1");
    expect(item.consumption?.id).toBe("pmc1");
    // header (order+penjualan+pelanggan) uses 3 queryOne; items use batch queries.
    expect(__mock.db.queryOne.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
