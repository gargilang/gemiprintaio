/**
 * Void pembelian — reverse efek samping (jalur SQLite/TS non-RPC).
 *
 * Coverage:
 *   - Stok balik: void posting PURCHASE_VOID negatif membalik PURCHASE_RECEIPT.
 *   - Kas: baris keuangan ber-[REF:purchaseId] jadi VOIDED.
 *   - Hutang: hutang_pembelian di-nol-kan + status LUNAS.
 *   - Header pembelian jadi VOIDED.
 *   - Guard: tolak void bila stok dari pembelian sudah dipakai di penjualan.
 *   - Guard: tolak void bila hutang sudah ada pelunasan.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: { ...real.__mock.db, getNativeSQLite: async () => null },
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
    isCompositeTransactionAtomic: async () => false,
  };
});

// Default flag OFF, tapi mock eksplisit supaya jalur RPC tidak terpicu.
jest.mock("@/lib/feature-flags", () => ({
  __esModule: true,
  usePgCompositeRpc: () => false,
}));

const getInventoryMovementsMock = jest.fn();
const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getInventoryMovements: (...args: any[]) => getInventoryMovementsMock(...args),
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  rebuildInventoryBalance: jest.fn(),
  convertRollVariant: jest.fn(),
  findOrCreateRollVariant: jest.fn(),
}));

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { voidPurchase } from "../services/purchases-mutations";

beforeEach(() => {
  resetMockDb();
  getInventoryMovementsMock.mockReset().mockResolvedValue([]);
  postInventoryMovementMock.mockReset().mockResolvedValue({});
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
});

function seedPurchaseWithStock() {
  mockTable("pembelian").set("P1", {
    id: "P1",
    nomor_faktur: "FP-001",
    nomor_pembelian: "PO-001",
    status_transaksi: "POSTED",
    total_jumlah: 100000,
    tanggal: "2026-06-10",
  });
  mockTable("item_pembelian").set("IP1", {
    id: "IP1",
    pembelian_id: "P1",
    barang_id: "B1",
    jumlah: 10,
    faktor_konversi: 1,
    harga_satuan: 10000,
  });
  // Stok cukup untuk di-reverse (10 unit dibeli, 10 masih ada).
  mockTable("barang").set("B1", {
    id: "B1",
    nama: "Tinta",
    jumlah_stok: 10,
  });
  // Movement PURCHASE_RECEIPT asli (qty +10).
  getInventoryMovementsMock.mockImplementation(async (filter: any) => {
    if (filter?.source_type === "PURCHASE" && filter?.source_id === "P1") {
      return [
        {
          id: "MOV1",
          barang_id: "B1",
          movement_type: "PURCHASE_RECEIPT",
          qty_delta: 10,
          unit_cost: 10000,
          source_line_id: "IP1",
        },
      ];
    }
    return [];
  });
}

describe("void-purchase-side-effects", () => {
  test("membalik stok, kas, hutang, dan header jadi VOIDED", async () => {
    seedPurchaseWithStock();
    mockTable("keuangan").set("K1", {
      id: "K1",
      kategori_transaksi: "SUPPLY",
      kredit: 100000,
      keperluan: "Pembelian Faktur FP-001 [REF:P1]",
      status_transaksi: "POSTED",
    });
    mockTable("hutang_pembelian").set("H1", {
      id: "H1",
      id_pembelian: "P1",
      jumlah_hutang: 100000,
      jumlah_terbayar: 0,
      sisa_hutang: 100000,
      status: "AKTIF",
    });

    await voidPurchase("P1", "salah input", "user-1");

    // Stok dibalik via PURCHASE_VOID negatif.
    expect(postInventoryMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_type: "PURCHASE_VOID",
        qty_delta: -10,
        source_id: "P1",
        source_line_id: "IP1",
      })
    );
    // Kas VOIDED.
    expect(mockTable("keuangan").get("K1").status_transaksi).toBe("VOIDED");
    // Hutang nol + LUNAS.
    const h = mockTable("hutang_pembelian").get("H1");
    expect(h.sisa_hutang).toBe(0);
    expect(h.jumlah_terbayar).toBe(0);
    expect(h.status).toBe("LUNAS");
    // Header VOIDED.
    expect(mockTable("pembelian").get("P1").status_transaksi).toBe("VOIDED");
  });

  test("tolak void bila stok pembelian sudah dipakai di penjualan", async () => {
    seedPurchaseWithStock();
    // Stok tinggal 3 dari 10 yang dibeli → sebagian sudah keluar untuk jualan.
    mockTable("barang").set("B1", { id: "B1", nama: "Tinta", jumlah_stok: 3 });
    // Penjualan yang memakai barang ini.
    mockTable("penjualan").set("S9", {
      id: "S9",
      nomor_faktur: "INV-9",
      dibuat_pada: "2026-06-10",
    });
    getInventoryMovementsMock.mockImplementation(async (filter: any) => {
      if (filter?.source_type === "PURCHASE" && filter?.source_id === "P1") {
        return [
          {
            id: "MOV1",
            barang_id: "B1",
            movement_type: "PURCHASE_RECEIPT",
            qty_delta: 10,
            unit_cost: 10000,
            source_line_id: "IP1",
          },
        ];
      }
      if (filter?.barang_id === "B1" && filter?.source_type === "SALE") {
        return [
          {
            id: "MOVS",
            barang_id: "B1",
            movement_type: "SALE_ISSUE",
            qty_delta: -7,
            source_id: "S9",
          },
        ];
      }
      return [];
    });

    await expect(voidPurchase("P1", "salah", "user-1")).rejects.toThrow(
      /sudah dipakai|INV-9/i
    );
    // Header tetap POSTED (tidak ter-void).
    expect(mockTable("pembelian").get("P1").status_transaksi).toBe("POSTED");
  });

  test("tolak void bila hutang sudah ada pelunasan", async () => {
    seedPurchaseWithStock();
    mockTable("hutang_pembelian").set("H1", {
      id: "H1",
      id_pembelian: "P1",
      jumlah_hutang: 100000,
      sisa_hutang: 50000,
      status: "AKTIF",
    });
    mockTable("pelunasan_hutang").set("PH1", {
      id: "PH1",
      id_hutang: "H1",
      jumlah: 50000,
    });

    await expect(voidPurchase("P1", "salah", "user-1")).rejects.toThrow(
      /pembayaran tagihan|revert/i
    );
    expect(mockTable("pembelian").get("P1").status_transaksi).toBe("POSTED");
  });
});
