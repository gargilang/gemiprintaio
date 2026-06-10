/**
 * Koreksi (void) konsumsi material produksi.
 *
 * Coverage:
 *   - voidProductionMaterialConsumption: posting ADJUSTMENT pembalik untuk
 *     movement konsumsi (+ waste bila ada), konsumsi jadi VOIDED, item produksi
 *     dikembalikan ke PENDING/MENUNGGU agar bisa dikonfirmasi ulang.
 *   - Idempoten: konsumsi yang sudah VOIDED tidak diproses ulang.
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

const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getRollVariants: jest.fn(async () => []),
}));

jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(async () => ({})),
}));

import { voidProductionMaterialConsumption } from "../services/production-service";

beforeEach(() => {
  resetMockDb();
  postInventoryMovementMock.mockReset().mockResolvedValue({});
});

describe("voidProductionMaterialConsumption", () => {
  test("balik movement konsumsi, VOIDED konsumsi, item kembali PENDING/MENUNGGU", async () => {
    mockTable("inventory_movements").set("MOV1", {
      id: "MOV1",
      barang_id: "B1",
      movement_type: "SALE_ISSUE",
      qty_delta: -8,
      unit_cost: 5000,
      roll_variant_id: "RV1",
      roll_width_m: 1.6,
      linear_delta_m: -5,
    });
    mockTable("production_material_consumptions").set("C1", {
      id: "C1",
      item_produksi_id: "IPRD1",
      movement_id: "MOV1",
      status: "POSTED",
    });
    mockTable("item_produksi").set("IPRD1", {
      id: "IPRD1",
      order_produksi_id: "OP1",
      status: "SELESAI",
      roll_inventory_status: "POSTED",
    });
    mockTable("order_produksi").set("OP1", { id: "OP1", status: "SELESAI" });

    const ok = await voidProductionMaterialConsumption("C1", "salah roll", "user-1");

    expect(ok).toBe(true);
    // Posting ADJUSTMENT pembalik (qty positif membalik konsumsi negatif).
    expect(postInventoryMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_type: "ADJUSTMENT",
        qty_delta: 8,
        reversal_of_id: "MOV1",
        roll_variant_id: "RV1",
      })
    );
    // Konsumsi jadi VOIDED.
    expect(mockTable("production_material_consumptions").get("C1").status).toBe("VOIDED");
    // Item produksi dikembalikan agar bisa konfirmasi ulang.
    const item = mockTable("item_produksi").get("IPRD1");
    expect(item.roll_inventory_status).toBe("PENDING");
    expect(item.status).toBe("MENUNGGU");
  });

  test("idempoten: konsumsi yang sudah VOIDED tidak diproses ulang", async () => {
    mockTable("production_material_consumptions").set("C2", {
      id: "C2",
      item_produksi_id: "IPRD2",
      movement_id: "MOVX",
      status: "VOIDED",
    });

    const ok = await voidProductionMaterialConsumption("C2");

    expect(ok).toBe(true);
    expect(postInventoryMovementMock).not.toHaveBeenCalled();
  });
});
