// @jest-environment node
/**
 * Test guard skip komponen berdimensi di deductBomComponents (Task 3).
 *
 * Komponen BOM yang berdimensi (panjang/lebar/jumlah_roll terisi, barang
 * butuh_dimensi_status=1) TIDAK boleh dipotong m² polos di sini karena
 * akan ditangani oleh jalur konfirmasi roll produksi (baris anak +
 * postProductionMaterialConsumption).
 *
 * Komponen non-dimensi (mis. tiang, sekrup) TETAP dipotong seperti biasa.
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

// Mock resolver supaya fokus pada logika skip berdimensi.
jest.mock("@/lib/services/bom-service", () => ({
  resolveBomForUnitPrice: jest.fn(),
}));
const mockResolveBom = resolveBomForUnitPrice as jest.MockedFunction<
  typeof resolveBomForUnitPrice
>;

import { deductBomComponents } from "@/lib/services/production-service";

describe("deductBomComponents — skip komponen berdimensi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPostInventoryMovement.mockResolvedValue({ id: "mov-1" });
  });

  it("skip komponen berdimensi, tetap potong komponen non-dimensi", async () => {
    // BOM: 1 komponen berdimensi (Flexi 280) + 1 komponen non-dimensi (Tiang)
    mockResolveBom.mockResolvedValue([
      {
        id: "bk-flexi",
        parent_barang_id: "kaki-roll",
        komponen_id: "flexi-280",
        qty: 1,
        jumlah_roll: 1,
        panjang: 1.3,
        lebar: 0.6,
        unit_price_id: "harga-xbanner",
        is_deleted: 0,
      },
      {
        id: "bk-tiang",
        parent_barang_id: "kaki-roll",
        komponen_id: "tiang",
        qty: 2,
        // Tidak ada panjang/lebar → non-dimensi
        unit_price_id: "harga-xbanner",
        is_deleted: 0,
      },
    ]);

    // queryOne untuk cek butuh_dimensi_status komponen
    mockQueryOne.mockImplementation(async (table: string, opts: any) => {
      if (table === "barang") {
        const id = opts?.where?.id;
        if (id === "flexi-280") {
          return { data: { id, nama: "Flexi 280", butuh_dimensi_status: 1 }, error: null };
        }
        if (id === "tiang") {
          return { data: { id, nama: "Tiang", butuh_dimensi_status: 0 }, error: null };
        }
      }
      return { data: null, error: null };
    });

    await deductBomComponents({
      barangId: "kaki-roll",
      unitPriceId: "harga-xbanner",
      qtySPK: 1,
      spkId: "OP-1",
      nomorSpk: "SPK-001",
      dibuatOleh: "u1",
      itemProduksiId: "IP-1",
    });

    // Flexi (dimensi) TIDAK dipotong di sini
    const callsForFlexi = mockPostInventoryMovement.mock.calls.filter(
      (call: any[]) => call[0]?.barang_id === "flexi-280",
    );
    expect(callsForFlexi).toHaveLength(0);

    // Tiang (non-dimensi) TETAP dipotong
    const callsForTiang = mockPostInventoryMovement.mock.calls.filter(
      (call: any[]) => call[0]?.barang_id === "tiang",
    );
    expect(callsForTiang).toHaveLength(1);
    expect(callsForTiang[0][0].qty_delta).toBe(-2); // qty=2, qtySPK=1 → 2×1=2
  });

  it("komponen berdimensi tanpa panjang/lebar tetap dipotong seperti biasa", async () => {
    // Komponen punya butuh_dimensi_status=1 TAPI tidak ada panjang/lebar di BOM
    // → tidak memenuhi syarat skip (mungkin data tidak lengkap)
    mockResolveBom.mockResolvedValue([
      {
        id: "bk-partial",
        parent_barang_id: "barang-x",
        komponen_id: "bahan-y",
        qty: 3,
        // panjang/lebar tidak diisi
        unit_price_id: null,
        is_deleted: 0,
      },
    ]);

    mockQueryOne.mockResolvedValue({
      data: { id: "bahan-y", nama: "Bahan Y", butuh_dimensi_status: 1 },
      error: null,
    });

    await deductBomComponents({
      barangId: "barang-x",
      qtySPK: 2,
      spkId: "OP-2",
      nomorSpk: "SPK-002",
      dibuatOleh: "u1",
    });

    // Karena panjang/lebar kosong → tidak memenuhi syarat skip → tetap dipotong
    const callsForBahanY = mockPostInventoryMovement.mock.calls.filter(
      (call: any[]) => call[0]?.barang_id === "bahan-y",
    );
    expect(callsForBahanY).toHaveLength(1);
    expect(callsForBahanY[0][0].qty_delta).toBe(-6); // qty=3, qtySPK=2 → 3×2=6
  });
});
