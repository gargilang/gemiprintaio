// @jest-environment node
/**
 * Test untuk logika BOM deduction saat SPK item diselesaikan.
 * Memastikan postInventoryMovement dipanggil per komponen (KELUAR = qty_delta negatif).
 *
 * B2: deductBomComponents memakai resolveBomForUnitPrice (di-mock) —
 * resolver dites terpisah di bom-resolver.test.ts.
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

import { resolveBomForUnitPrice } from "@/lib/services/bom-service";

// Mock resolver supaya test deductBomComponents fokus pada logika potong stok,
// bukan pada query resolver (resolver sudah dites terpisah di bom-resolver.test.ts).
jest.mock("@/lib/services/bom-service", () => ({
  resolveBomForUnitPrice: jest.fn(),
}));
const mockResolveBom = resolveBomForUnitPrice as jest.MockedFunction<
  typeof resolveBomForUnitPrice
>;

import { deductBomComponents } from "@/lib/services/production-service";

describe("deductBomComponents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostInventoryMovement.mockResolvedValue({ id: "mov-1" });
  });

  it("tidak memanggil postInventoryMovement jika barang tidak punya komponen", async () => {
    mockResolveBom.mockResolvedValue([]);
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
    mockResolveBom.mockResolvedValue([
      {
        id: "bk-1",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-kaki",
        qty: 1,
        is_deleted: 0,
      },
    ]);
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
      }),
    );
  });

  it("memanggil postInventoryMovement untuk dua komponen dengan qty benar", async () => {
    mockResolveBom.mockResolvedValue([
      {
        id: "bk-1",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-kaki",
        qty: 1,
        is_deleted: 0,
      },
      {
        id: "bk-2",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-sekrup",
        qty: 4,
        is_deleted: 0,
      },
    ]);
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
      expect.objectContaining({ barang_id: "b-kaki", qty_delta: -2 }),
    );
    expect(mockPostInventoryMovement).toHaveBeenCalledWith(
      expect.objectContaining({ barang_id: "b-sekrup", qty_delta: -8 }),
    );
  });

  it("memanggil postInventoryMovement untuk komponen berdimensi (m²)", async () => {
    mockResolveBom.mockResolvedValue([
      {
        id: "bk-dim",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-vinyl",
        qty: 6,
        jumlah_roll: 1,
        lebar: 2,
        panjang: 3,
        is_deleted: 0,
      },
    ]);
    await deductBomComponents({
      barangId: "b-xbanner",
      qtySPK: 2,
      spkId: "spk-003",
      nomorSpk: "SPK-003",
      dibuatOleh: "user-1",
      itemProduksiId: "item-3",
    });
    expect(mockPostInventoryMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        barang_id: "b-vinyl",
        qty_delta: -12,
      }),
    );
  });
});

describe("deductBomComponents — unitPriceId (B2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostInventoryMovement.mockResolvedValue({ id: "mov-1" });
  });

  it("memanggil resolveBomForUnitPrice dengan unitPriceId yang diberikan", async () => {
    mockResolveBom.mockResolvedValueOnce([
      {
        id: "bk-1",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-kaki",
        qty: 1,
        is_deleted: 0,
      },
    ]);
    await deductBomComponents({
      barangId: "b-xbanner",
      unitPriceId: "up-xbanner",
      qtySPK: 2,
      spkId: "spk-001",
      nomorSpk: "SPK-001",
      dibuatOleh: "user-1",
      itemProduksiId: "item-1",
    });
    expect(mockResolveBom).toHaveBeenCalledWith("b-xbanner", "up-xbanner");
  });

  it("unitPriceId null → resolver fallback ke scope barang-level", async () => {
    mockResolveBom.mockResolvedValueOnce([]);
    await deductBomComponents({
      barangId: "b-flexi",
      unitPriceId: null,
      qtySPK: 1,
      spkId: "spk-002",
      nomorSpk: "SPK-002",
      dibuatOleh: "user-1",
    });
    expect(mockResolveBom).toHaveBeenCalledWith("b-flexi", null);
    expect(mockPostInventoryMovement).not.toHaveBeenCalled();
  });

  it("resolver return [] → tidak memanggil postInventoryMovement", async () => {
    mockResolveBom.mockResolvedValueOnce([]);
    await deductBomComponents({
      barangId: "b-flexi",
      unitPriceId: "up-outdoor",
      qtySPK: 3,
      spkId: "spk-003",
      nomorSpk: "SPK-003",
      dibuatOleh: "user-1",
    });
    expect(mockPostInventoryMovement).not.toHaveBeenCalled();
  });
});
