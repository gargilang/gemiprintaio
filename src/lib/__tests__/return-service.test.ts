/**
 * Return service tests (sales return + purchase return).
 *
 * Sales return:
 *   - qty > sisa invoice ditolak
 *   - stok kembali via SALE_RETURN movement
 *   - piutang dikurangi dulu sebelum refund
 *   - refund cashbook hanya nilai yang sudah terbayar
 *   - non-cash reversal entry untuk bagian yang masuk piutang
 *   - RETUR_HPP entry membalik HPP
 *
 * Purchase return:
 *   - qty > sisa pembelian ditolak
 *   - hutang dikurangi dulu sebelum refund vendor
 *   - edge cases: unpaid (semua → debt_reduction), partial (sisa → debt,
 *     kelebihan → refund), fully paid (semua → refund)
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

const recalculateMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) => recalculateMock(...args),
}));

const postInventoryMovementMock = jest.fn();
const getInventoryMovementsMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getInventoryMovements: (...args: any[]) => getInventoryMovementsMock(...args),
}));

const getSalesMock = jest.fn();
jest.mock("@/lib/services/pos-service", () => ({
  __esModule: true,
  getSales: (...args: any[]) => getSalesMock(...args),
}));

const getPurchasesMock = jest.fn();
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  getPurchases: (...args: any[]) => getPurchasesMock(...args),
}));

import {
  createPurchaseReturn,
  createSalesReturn,
} from "../services/return-service";

function seedSale(opts: {
  saleId: string;
  itemId: string;
  jumlah?: number;
  hargaSatuan?: number;
  hppSatuan?: number;
  receivable?: { jumlah: number; sisa: number; jumlahTerbayar: number } | null;
}) {
  const jumlah = opts.jumlah ?? 10;
  const harga = opts.hargaSatuan ?? 1000;
  const hppSatuan = opts.hppSatuan ?? 600;
  mockTable("penjualan").set(opts.saleId, {
    id: opts.saleId,
    nomor_faktur: `INV-${opts.saleId}`,
    status_transaksi: "POSTED",
    total_jumlah: jumlah * harga,
  });
  mockTable("item_penjualan").set(opts.itemId, {
    id: opts.itemId,
    penjualan_id: opts.saleId,
    barang_id: "barang-1",
    jumlah,
    nama_satuan: "lembar",
    faktor_konversi: 1,
    harga_satuan: harga,
    subtotal: jumlah * harga,
    hpp_satuan: hppSatuan,
    hpp_total: hppSatuan * jumlah,
    dpp_total: jumlah * harga,
    ppn_total: 0,
  });
  if (opts.receivable !== null) {
    const r = opts.receivable ?? { jumlah: jumlah * harga, sisa: jumlah * harga, jumlahTerbayar: 0 };
    mockTable("piutang_penjualan").set(`piu-${opts.saleId}`, {
      id: `piu-${opts.saleId}`,
      id_penjualan: opts.saleId,
      jumlah_piutang: r.jumlah,
      sisa_piutang: r.sisa,
      jumlah_terbayar: r.jumlahTerbayar,
    });
  }
}

function seedPurchase(opts: {
  purchaseId: string;
  itemId: string;
  jumlah?: number;
  hargaSatuan?: number;
  totalDibayar?: number;
  withDebt?: { jumlah: number; sisa: number } | null;
}) {
  const jumlah = opts.jumlah ?? 10;
  const harga = opts.hargaSatuan ?? 5000;
  const total = jumlah * harga;
  mockTable("pembelian").set(opts.purchaseId, {
    id: opts.purchaseId,
    nomor_pembelian: `PCH-${opts.purchaseId}`,
    nomor_faktur: `FK-${opts.purchaseId}`,
    status_transaksi: "POSTED",
    total_jumlah: total,
    jumlah_dibayar: opts.totalDibayar ?? 0,
  });
  mockTable("item_pembelian").set(opts.itemId, {
    id: opts.itemId,
    pembelian_id: opts.purchaseId,
    barang_id: "barang-1",
    jumlah,
    nama_satuan: "kg",
    faktor_konversi: 1,
    harga_satuan: harga,
    subtotal: total,
    dpp_total: total,
    ppn_total: 0,
  });
  if (opts.withDebt !== null && opts.withDebt !== undefined) {
    mockTable("hutang_pembelian").set(`hut-${opts.purchaseId}`, {
      id: `hut-${opts.purchaseId}`,
      id_pembelian: opts.purchaseId,
      jumlah_hutang: opts.withDebt.jumlah,
      sisa_hutang: opts.withDebt.sisa,
    });
  }
}

beforeEach(() => {
  resetMockDb();
  recalculateMock.mockReset();
  postInventoryMovementMock.mockReset().mockImplementation(async (input) => ({
    id: `mov-${input.source_line_id || input.source_id}`,
    ...input,
  }));
  getInventoryMovementsMock.mockReset().mockResolvedValue([]);
  getSalesMock.mockResolvedValue([]);
  getPurchasesMock.mockResolvedValue([]);
});

describe("createSalesReturn", () => {
  it("menolak qty > sisa faktur", async () => {
    seedSale({ saleId: "sale-1", itemId: "item-1", jumlah: 5 });
    await expect(
      createSalesReturn({
        sale_id: "sale-1",
        reason: "salah ukuran",
        items: [{ item_penjualan_id: "item-1", qty: 6 }],
      })
    ).rejects.toThrow(/melebihi sisa qty/);
  });

  it("memposting movement SALE_RETURN, mengurangi piutang, dan menulis entri buku kas RETUR_HPP", async () => {
    seedSale({ saleId: "sale-1", itemId: "item-1", jumlah: 10, hargaSatuan: 1000, hppSatuan: 600 });
    const result = await createSalesReturn({
      sale_id: "sale-1",
      reason: "rusak",
      items: [{ item_penjualan_id: "item-1", qty: 4 }],
    });
    expect(result.total_retur).toBe(4000);

    // Stock movement is the SALE_RETURN type with positive qty (stok masuk).
    expect(postInventoryMovementMock).toHaveBeenCalledTimes(1);
    expect(postInventoryMovementMock.mock.calls[0][0]).toMatchObject({
      movement_type: "SALE_RETURN",
      qty_delta: 4,
      source_type: "SALE_RETURN",
    });

    // Receivable reduced by full retur (invoice unpaid).
    const r = mockTable("piutang_penjualan").get("piu-sale-1")!;
    expect(r.sisa_piutang).toBe(10000 - 4000);

    // No refund (refundAmount = 0 because invoice unpaid).
    const cashbook = Array.from(mockTable("keuangan").values());
    const refundEntry = cashbook.find((row) => row.kategori_transaksi === "RETUR_PENJUALAN");
    expect(refundEntry).toBeUndefined();
    // Non-cash reversal exists (full retur becomes non-cash because no refund).
    const nonCash = cashbook.find((row) => row.kategori_transaksi === "RETUR_PENJUALAN_NONCASH");
    expect(nonCash?.kredit).toBe(4000);
    // RETUR_HPP entry exists with debit = qty * hppSatuan.
    const hpp = cashbook.find((row) => row.kategori_transaksi === "RETUR_HPP");
    expect(hpp?.debit).toBe(2400);
  });

  it("saat faktur terbayar sebagian, refund hanya bagian yang sudah dibayar + non-tunai untuk sisanya", async () => {
    // Total invoice 10000, sudah dibayar 3000 → sisa piutang 7000.
    seedSale({
      saleId: "sale-1",
      itemId: "item-1",
      jumlah: 10,
      hargaSatuan: 1000,
      hppSatuan: 0,
      receivable: { jumlah: 10000, sisa: 7000, jumlahTerbayar: 3000 },
    });
    // Retur 5 lembar = 5000. Yang masuk piutang 5000 (≤ sisa). Refund = 0.
    await createSalesReturn({
      sale_id: "sale-1",
      reason: "warna salah",
      items: [{ item_penjualan_id: "item-1", qty: 5 }],
    });
    const cashbook = Array.from(mockTable("keuangan").values());
    expect(cashbook.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN")).toBeUndefined();
    expect(cashbook.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN_NONCASH")?.kredit).toBe(5000);

    // Now retur tambahan 6 lembar (>sisa setelah pengurangan 5). Reset retur dulu.
    resetMockDb();
    recalculateMock.mockReset();
    postInventoryMovementMock.mockReset().mockImplementation(async (input) => ({ id: "mov", ...input }));
    seedSale({
      saleId: "sale-1",
      itemId: "item-1",
      jumlah: 10,
      hargaSatuan: 1000,
      hppSatuan: 0,
      receivable: { jumlah: 10000, sisa: 4000, jumlahTerbayar: 6000 },
    });
    // Retur 8 lembar = 8000. Sisa piutang 4000 → debtReduction 4000, refund 4000.
    await createSalesReturn({
      sale_id: "sale-1",
      reason: "warna salah",
      items: [{ item_penjualan_id: "item-1", qty: 8 }],
    });
    const cb2 = Array.from(mockTable("keuangan").values());
    expect(cb2.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN")?.kredit).toBe(4000);
    expect(cb2.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN_NONCASH")?.kredit).toBe(4000);
  });

  it("saat tidak ada baris piutang sama sekali (penjualan tunai), refund seluruh retur", async () => {
    seedSale({
      saleId: "sale-cash",
      itemId: "item-cash",
      jumlah: 5,
      hargaSatuan: 1000,
      receivable: null,
    });
    await createSalesReturn({
      sale_id: "sale-cash",
      reason: "cancel",
      items: [{ item_penjualan_id: "item-cash", qty: 2 }],
    });
    const cashbook = Array.from(mockTable("keuangan").values());
    expect(cashbook.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN")?.kredit).toBe(2000);
    expect(cashbook.find((r) => r.kategori_transaksi === "RETUR_PENJUALAN_NONCASH")).toBeUndefined();
  });
});

describe("createPurchaseReturn", () => {
  it("rejects qty > sisa pembelian", async () => {
    seedPurchase({ purchaseId: "p-1", itemId: "ip-1", jumlah: 4, hargaSatuan: 5000 });
    await expect(
      createPurchaseReturn({
        purchase_id: "p-1",
        reason: "rusak",
        items: [{ item_pembelian_id: "ip-1", qty: 5 }],
      })
    ).rejects.toThrow(/melebihi sisa qty/);
  });

  it("belum dibayar: pengurangan hutang penuh, tidak ada refund", async () => {
    seedPurchase({
      purchaseId: "p-1",
      itemId: "ip-1",
      jumlah: 10,
      hargaSatuan: 5000,
      totalDibayar: 0,
      withDebt: { jumlah: 50000, sisa: 50000 },
    });
    await createPurchaseReturn({
      purchase_id: "p-1",
      reason: "rusak semua",
      items: [{ item_pembelian_id: "ip-1", qty: 4 }],
    });
    const retur = Array.from(mockTable("retur_pembelian").values())[0];
    expect(retur.debt_reduction).toBe(20000);
    expect(retur.refund_amount).toBe(0);
    expect(mockTable("hutang_pembelian").get("hut-p-1")!.sisa_hutang).toBe(30000);

    const cashbook = Array.from(mockTable("keuangan").values());
    expect(cashbook.find((r) => r.kategori_transaksi === "RETUR_PEMBELIAN")).toBeUndefined();
  });

  it("dibayar sebagian: tutup sisa hutang dulu, refund sisanya", async () => {
    seedPurchase({
      purchaseId: "p-1",
      itemId: "ip-1",
      jumlah: 10,
      hargaSatuan: 5000,
      totalDibayar: 30000,
      withDebt: { jumlah: 50000, sisa: 20000 },
    });
    await createPurchaseReturn({
      purchase_id: "p-1",
      reason: "rusak",
      items: [{ item_pembelian_id: "ip-1", qty: 6 }], // total retur 30k
    });
    const retur = Array.from(mockTable("retur_pembelian").values())[0];
    expect(retur.debt_reduction).toBe(20000);
    expect(retur.refund_amount).toBe(10000);
    expect(mockTable("hutang_pembelian").get("hut-p-1")!.sisa_hutang).toBe(0);

    const refund = Array.from(mockTable("keuangan").values()).find(
      (r) => r.kategori_transaksi === "RETUR_PEMBELIAN"
    );
    expect(refund?.debit).toBe(10000);
  });

  it("sudah lunas (tidak ada baris hutang): refund vendor untuk jumlah penuh", async () => {
    seedPurchase({
      purchaseId: "p-1",
      itemId: "ip-1",
      jumlah: 10,
      hargaSatuan: 5000,
      totalDibayar: 50000,
      withDebt: null,
    });
    await createPurchaseReturn({
      purchase_id: "p-1",
      reason: "rusak",
      items: [{ item_pembelian_id: "ip-1", qty: 3 }],
    });
    const retur = Array.from(mockTable("retur_pembelian").values())[0];
    expect(retur.debt_reduction).toBe(0);
    expect(retur.refund_amount).toBe(15000);
    const refund = Array.from(mockTable("keuangan").values()).find(
      (r) => r.kategori_transaksi === "RETUR_PEMBELIAN"
    );
    expect(refund?.debit).toBe(15000);
  });

  it("memposting movement inventori PURCHASE_RETURN (qty negatif)", async () => {
    seedPurchase({
      purchaseId: "p-1",
      itemId: "ip-1",
      jumlah: 10,
      hargaSatuan: 5000,
      totalDibayar: 0,
      withDebt: { jumlah: 50000, sisa: 50000 },
    });
    await createPurchaseReturn({
      purchase_id: "p-1",
      reason: "salah",
      items: [{ item_pembelian_id: "ip-1", qty: 2 }],
    });
    expect(postInventoryMovementMock).toHaveBeenCalledTimes(1);
    expect(postInventoryMovementMock.mock.calls[0][0]).toMatchObject({
      movement_type: "PURCHASE_RETURN",
      qty_delta: -2,
      source_type: "PURCHASE_RETURN",
    });
  });
});
