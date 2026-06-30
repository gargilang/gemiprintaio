// @jest-environment node
/**
 * Test untuk logika BOM deduction saat SPK item diselesaikan.
 * Memastikan postInventoryMovement dipanggil per komponen (KELUAR = qty_delta negatif).
 */

const mockQuery = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockQueryOne = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: mockQuery,
    insert: mockInsert,
    update: mockUpdate,
    queryOne: mockQueryOne,
  },
  generateId: jest.fn(() => "mock-id"),
  getCurrentTimestamp: jest.fn(() => "2026-01-01T00:00:00Z"),
}));

const mockPostInventoryMovement = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  postInventoryMovement: mockPostInventoryMovement,
  getRollVariants: jest.fn(),
}));

import { deductBomComponents } from "@/lib/services/production-service";

describe("deductBomComponents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostInventoryMovement.mockResolvedValue({ id: "mov-1" });
  });

  it("tidak memanggil postInventoryMovement jika barang tidak punya komponen", async () => {
    mockQuery.mockResolvedValue({ data: [], error: null });
    await deductBomComponents({
      barangId: "b-xbanner",
      qtySPK: 2,
      spkId: "spk-001",
      nomorSpk: "SPK-001",
      dibuatOleh: "user-1",
    });
    expect(mockPostInventoryMovement).not.toHaveBeenCalled();
  });

  it("memanggil postInventoryMovement untuk setiap komponen × qty SPK", async () => {
    mockQuery.mockResolvedValue({
      data: [{ id: "bk-1", komponen_id: "b-kaki", qty: 1, is_deleted: 0 }],
      error: null,
    });
    await deductBomComponents({
      barangId: "b-xbanner",
      qtySPK: 3,
      spkId: "spk-001",
      nomorSpk: "SPK-001",
      dibuatOleh: "user-1",
      itemProduksiId: "item-1",
    });
    expect(mockPostInventoryMovement).toHaveBeenCalledTimes(1);
    expect(mockPostInventoryMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        barang_id: "b-kaki",
        qty_delta: -3,
        movement_type: "PRODUCTION_ISSUE",
        source_type: "PRODUCTION_BOM",
        id: "bom-item-1-bk-1",
        catatan: "Rakitan SPK #SPK-001 [REF:spk-001]",
        dibuat_oleh: "user-1",
      })
    );
  });

  it("memanggil postInventoryMovement untuk dua komponen dengan qty benar", async () => {
    mockQuery.mockResolvedValue({
      data: [
        { id: "bk-1", komponen_id: "b-kaki", qty: 1, is_deleted: 0 },
        { id: "bk-2", komponen_id: "b-sekrup", qty: 4, is_deleted: 0 },
      ],
      error: null,
    });
    await deductBomComponents({
      barangId: "b-xbanner",
      qtySPK: 2,
      spkId: "spk-002",
      nomorSpk: "SPK-002",
      dibuatOleh: "user-1",
      itemProduksiId: "item-2",
    });
    expect(mockPostInventoryMovement).toHaveBeenCalledTimes(2);
    expect(mockPostInventoryMovement).toHaveBeenCalledWith(
      expect.objectContaining({ barang_id: "b-kaki", qty_delta: -2 })
    );
    expect(mockPostInventoryMovement).toHaveBeenCalledWith(
      expect.objectContaining({ barang_id: "b-sekrup", qty_delta: -8 })
    );
  });
});
