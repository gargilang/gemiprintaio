/**
 * Orkestrator pembayaran lump-sum piutang (payReceivableLumpSum).
 *
 * Coverage:
 *   - Alokasi FIFO: tagihan tertua dulu, stop saat uang habis.
 *   - Kelebihan uang → sisa_uang (tidak disimpan ke DB).
 *   - Tolak bila tanggal masuk periode akuntansi tertutup.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: { ...real.__mock.db, getNativeSQLite: async () => null },
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
    isCompositeTransactionAtomic: async () => false,
  };
});

jest.mock("@/lib/feature-flags", () => ({
  __esModule: true,
  usePgCompositeRpc: () => false,
}));

// Mock semua service yang diimpor oleh pos-mutations
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: jest.fn(),
  deleteMaklonPurchasesForSale: jest.fn(),
}));

jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: jest.fn(),
  getInventoryMovements: jest.fn().mockResolvedValue([]),
  rebuildInventoryBalance: jest.fn().mockResolvedValue(undefined),
  getRollVariants: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/services/bom-service", () => ({
  __esModule: true,
  resolveBomForUnitPrice: jest.fn(),
  computeBomCostPerUnit: jest.fn(),
}));

jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn().mockResolvedValue({
    inv_prefix: "INV",
    inv_format: "PREFIX-DATE-SEQ",
    inv_date_format: "YYYYMMDD",
    inv_reset: "daily",
    inv_padding: 3,
    inv_start_seq: 1,
    spk_prefix: "SPK",
    spk_format: "PREFIX-SEQ",
    spk_reset: "monthly",
    spk_padding: 4,
    spk_start_seq: 1,
  }),
}));

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

// Mock isDateInClosedPeriod — default: tidak tertutup
const isDateInClosedPeriodMock = jest.fn().mockResolvedValue(false);
jest.mock("@/lib/services/accounting-periods-service", () => ({
  __esModule: true,
  isDateInClosedPeriod: (...args: any[]) =>
    isDateInClosedPeriodMock(...args),
}));

import { payReceivableLumpSum } from "../services/pos-mutations";

beforeEach(() => {
  resetMockDb();
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
  isDateInClosedPeriodMock.mockReset().mockResolvedValue(false);

  // Seed 4 tagihan Pak Didi: sisa 50k, 100k, 200k, 300k (dibuat_pada asc: a,b,c,d)
  mockTable("penjualan").set("pj-a", {
    id: "pj-a",
    nomor_faktur: "INV-001",
    pelanggan_id: "didi",
    status_transaksi: "POSTED",
  });
  mockTable("penjualan").set("pj-b", {
    id: "pj-b",
    nomor_faktur: "INV-002",
    pelanggan_id: "didi",
    status_transaksi: "POSTED",
  });
  mockTable("penjualan").set("pj-c", {
    id: "pj-c",
    nomor_faktur: "INV-003",
    pelanggan_id: "didi",
    status_transaksi: "POSTED",
  });
  mockTable("penjualan").set("pj-d", {
    id: "pj-d",
    nomor_faktur: "INV-004",
    pelanggan_id: "didi",
    status_transaksi: "POSTED",
  });

  mockTable("piutang_penjualan").set("a", {
    id: "a",
    id_penjualan: "pj-a",
    jumlah_piutang: 50000,
    jumlah_terbayar: 0,
    sisa_piutang: 50000,
    status: "AKTIF",
    dibuat_pada: "2026-01-01",
  });
  mockTable("piutang_penjualan").set("b", {
    id: "b",
    id_penjualan: "pj-b",
    jumlah_piutang: 100000,
    jumlah_terbayar: 0,
    sisa_piutang: 100000,
    status: "AKTIF",
    dibuat_pada: "2026-02-01",
  });
  mockTable("piutang_penjualan").set("c", {
    id: "c",
    id_penjualan: "pj-c",
    jumlah_piutang: 200000,
    jumlah_terbayar: 0,
    sisa_piutang: 200000,
    status: "AKTIF",
    dibuat_pada: "2026-03-01",
  });
  mockTable("piutang_penjualan").set("d", {
    id: "d",
    id_penjualan: "pj-d",
    jumlah_piutang: 300000,
    jumlah_terbayar: 0,
    sisa_piutang: 300000,
    status: "AKTIF",
    dibuat_pada: "2026-04-01",
  });
});

it("alokasi FIFO 400rb → 50/100/200 lunas + 50 ke tagihan 300", async () => {
  // tagihan_ids sengaja acak — server harus urut ulang FIFO
  const res = await payReceivableLumpSum({
    tagihan_ids: ["d", "c", "b", "a"],
    jumlah_bayar: 400000,
    metode_pembayaran: "TRANSFER",
    dibuat_oleh: "u1",
  });

  expect(res.total_dialokasikan).toBe(400000);
  expect(res.sisa_uang).toBe(0);
  expect(res.alokasi).toHaveLength(4);

  const byId = Object.fromEntries(res.alokasi.map((x) => [x.piutang_id, x]));

  // a: 50k (tertua) → lunas
  expect(byId["a"].dibayar).toBe(50000);
  expect(byId["a"].status_baru).toBe("LUNAS");

  // b: 100k → lunas
  expect(byId["b"].dibayar).toBe(100000);
  expect(byId["b"].status_baru).toBe("LUNAS");

  // c: 200k → lunas
  expect(byId["c"].dibayar).toBe(200000);
  expect(byId["c"].status_baru).toBe("LUNAS");

  // d: bayar 50k (sisa dari 400k) → sebagian
  expect(byId["d"].dibayar).toBe(50000);
  expect(byId["d"].status_baru).toBe("SEBAGIAN");
});

it("kelebihan uang dikembalikan sebagai sisa_uang", async () => {
  // hanya 2 tagihan: a(50k) + b(100k) = 150k total, bayar 200k
  const res = await payReceivableLumpSum({
    tagihan_ids: ["a", "b"],
    jumlah_bayar: 200000,
  });

  expect(res.total_dialokasikan).toBe(150000);
  expect(res.sisa_uang).toBe(50000);
});

it("tolak bila tanggal masuk periode tertutup", async () => {
  isDateInClosedPeriodMock.mockResolvedValue(true);

  await expect(
    payReceivableLumpSum({
      tagihan_ids: ["a"],
      jumlah_bayar: 10000,
      tanggal_bayar: "2020-01-01",
    }),
  ).rejects.toThrow(/periode|ditutup|tutup/i);
});
