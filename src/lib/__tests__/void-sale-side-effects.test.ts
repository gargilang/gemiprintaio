/**
 * Void penjualan — reverse efek samping.
 *
 * Coverage:
 *   - Guard: SPK (order produksi) yang penjualannya VOIDED tidak bisa
 *     dihidupkan lagi lewat updateProductionOrderStatus.
 *   - NSFP: voidSale (jalur SQLite) melepas nomor seri faktur pajak
 *     TERPAKAI -> TERSEDIA.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
    isCompositeTransactionAtomic: async () => false,
  };
});

const getInventoryMovementsMock = jest.fn();
const postInventoryMovementMock = jest.fn();
const rebuildInventoryBalanceMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getInventoryMovements: (...args: any[]) => getInventoryMovementsMock(...args),
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  rebuildInventoryBalance: (...args: any[]) => rebuildInventoryBalanceMock(...args),
}));

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

const deleteMaklonPurchasesForSaleMock = jest.fn();
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: jest.fn(),
  deleteMaklonPurchasesForSale: (...args: any[]) =>
    deleteMaklonPurchasesForSaleMock(...args),
}));

import { updateProductionOrderStatus } from "../services/production-service";
import { voidSale } from "../services/pos-mutations";

beforeEach(() => {
  resetMockDb();
  getInventoryMovementsMock.mockReset().mockResolvedValue([]);
  postInventoryMovementMock.mockReset().mockResolvedValue({});
  rebuildInventoryBalanceMock.mockReset().mockResolvedValue(undefined);
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
  deleteMaklonPurchasesForSaleMock.mockReset().mockResolvedValue(undefined);
});

describe("void-sale-side-effects", () => {
  test("tolak hidupkan order DIBATALKAN milik penjualan VOIDED", async () => {
    mockTable("penjualan").set("S1", { id: "S1", status_transaksi: "VOIDED" });
    mockTable("order_produksi").set("OP1", {
      id: "OP1",
      penjualan_id: "S1",
      status: "DIBATALKAN",
    });
    await expect(updateProductionOrderStatus("OP1", "MENUNGGU")).rejects.toThrow(
      /penjualan.*dibatalkan|VOIDED|tidak bisa/i
    );
  });

  test("void melepas NSFP yang terkunci ke penjualan", async () => {
    mockTable("penjualan").set("S2", {
      id: "S2",
      status_transaksi: "POSTED",
      dibuat_pada: "2026-06-10",
    });
    mockTable("nsfp_pool").set("N1", {
      id: "N1",
      status: "TERPAKAI",
      penjualan_id: "S2",
      tahun: "2026",
      kode_transaksi: "010",
      nomor_seri: "0000001",
    });
    await voidSale("S2", "batal uji", "user-1");
    expect(mockTable("nsfp_pool").get("N1").status).toBe("TERSEDIA");
    expect(mockTable("nsfp_pool").get("N1").penjualan_id).toBeNull();
  });
});
