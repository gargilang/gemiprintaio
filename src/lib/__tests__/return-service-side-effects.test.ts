/**
 * Retur penjualan & pembelian — efek samping (jalur SQLite/TS).
 *
 * Coverage:
 *   - Retur penjualan: stok masuk (SALE_RETURN), piutang berkurang, baris kas
 *     refund + pembalik HPP, total PPN proporsional.
 *   - Retur pembelian: stok keluar (PURCHASE_RETURN), hutang berkurang, header
 *     pembelian total/jumlah_dibayar disesuaikan.
 *   - Guard: tolak retur bila transaksi induk sudah VOIDED.
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

const getInventoryMovementsMock = jest.fn();
const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getInventoryMovements: (...args: any[]) => getInventoryMovementsMock(...args),
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
}));

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { createSalesReturn, createPurchaseReturn } from "../services/return-service";

beforeEach(() => {
  resetMockDb();
  getInventoryMovementsMock.mockReset().mockResolvedValue([]);
  postInventoryMovementMock
    .mockReset()
    .mockImplementation(async (input: any) => ({ id: input.id, ...input }));
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
});

function cashbookRows() {
  return Array.from(mockTable("keuangan").values());
}

describe("retur penjualan", () => {
  test("retur penuh: stok masuk, piutang berkurang, kas refund + pembalik HPP", async () => {
    mockTable("penjualan").set("S1", {
      id: "S1",
      nomor_faktur: "INV-1",
      status_transaksi: "POSTED",
    });
    mockTable("item_penjualan").set("IT1", {
      id: "IT1",
      penjualan_id: "S1",
      barang_id: "B1",
      jumlah: 5,
      faktor_konversi: 1,
      harga_satuan: 20000,
      hpp_satuan: 12000,
      dpp_total: 100000,
      ppn_total: 0,
    });
    // Piutang penuh (belum dibayar) → reduksi piutang, bukan refund kas.
    mockTable("piutang_penjualan").set("PI1", {
      id: "PI1",
      id_penjualan: "S1",
      jumlah_piutang: 100000,
      jumlah_terbayar: 0,
      sisa_piutang: 100000,
      status: "AKTIF",
    });

    const res = await createSalesReturn({
      sale_id: "S1",
      reason: "barang cacat",
      items: [{ item_penjualan_id: "IT1", qty: 5 }],
    });

    expect(res.total_retur).toBe(100000);
    // Stok kembali masuk via SALE_RETURN qty positif.
    expect(postInventoryMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_type: "SALE_RETURN",
        qty_delta: 5,
        barang_id: "B1",
      })
    );
    // Piutang habis → LUNAS, refund kas = 0 (karena belum dibayar).
    const piutang = mockTable("piutang_penjualan").get("PI1");
    expect(piutang.sisa_piutang).toBe(0);
    expect(res.refund_amount).toBe(0);
    // Ada baris pembalik omzet non-cash + pembalik HPP.
    const keu = cashbookRows();
    expect(keu.some((k) => k.kategori_transaksi === "RETUR_PENJUALAN_NONCASH")).toBe(true);
    expect(keu.some((k) => k.kategori_transaksi === "RETUR_HPP")).toBe(true);
  });

  test("tolak retur bila penjualan sudah VOIDED", async () => {
    mockTable("penjualan").set("S2", {
      id: "S2",
      nomor_faktur: "INV-2",
      status_transaksi: "VOIDED",
    });
    await expect(
      createSalesReturn({
        sale_id: "S2",
        reason: "x",
        items: [{ item_penjualan_id: "any", qty: 1 }],
      })
    ).rejects.toThrow(/dibatalkan/i);
  });
});

describe("retur pembelian", () => {
  test("retur penuh: stok keluar, hutang berkurang, header disesuaikan", async () => {
    mockTable("pembelian").set("P1", {
      id: "P1",
      nomor_faktur: "FP-1",
      nomor_pembelian: "PO-1",
      status_transaksi: "POSTED",
      total_jumlah: 50000,
      jumlah_dibayar: 0,
    });
    mockTable("item_pembelian").set("IP1", {
      id: "IP1",
      pembelian_id: "P1",
      barang_id: "B1",
      jumlah: 5,
      faktor_konversi: 1,
      harga_satuan: 10000,
      dpp_total: 50000,
      ppn_total: 0,
    });
    mockTable("hutang_pembelian").set("H1", {
      id: "H1",
      id_pembelian: "P1",
      jumlah_hutang: 50000,
      jumlah_terbayar: 0,
      sisa_hutang: 50000,
      status: "AKTIF",
    });

    const res = await createPurchaseReturn({
      purchase_id: "P1",
      reason: "salah kirim",
      items: [{ item_pembelian_id: "IP1", qty: 5 }],
    });

    expect(res.total_retur).toBe(50000);
    // Stok keluar via PURCHASE_RETURN qty negatif.
    expect(postInventoryMovementMock).toHaveBeenCalledWith(
      expect.objectContaining({
        movement_type: "PURCHASE_RETURN",
        qty_delta: -5,
        barang_id: "B1",
      })
    );
    // Hutang berkurang penuh.
    const hutang = mockTable("hutang_pembelian").get("H1");
    expect(hutang.sisa_hutang).toBe(0);
    // Header pembelian total disesuaikan (50000 - 50000 = 0).
    const pembelian = mockTable("pembelian").get("P1");
    expect(pembelian.total_jumlah).toBe(0);
  });

  test("tolak retur bila pembelian sudah VOIDED", async () => {
    mockTable("pembelian").set("P2", {
      id: "P2",
      status_transaksi: "VOIDED",
    });
    await expect(
      createPurchaseReturn({
        purchase_id: "P2",
        reason: "x",
        items: [{ item_pembelian_id: "any", qty: 1 }],
      })
    ).rejects.toThrow(/dibatalkan/i);
  });
});
