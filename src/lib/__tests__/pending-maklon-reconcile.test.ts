/**
 * Reconcile pending maklon (C2 — Task 5).
 *
 * Setelah checkout, baris maklon tanpa vendor/biaya disimpan pending
 * (pending_vendor_hpp=1). Staf+ dapat mengisi vendor + biaya + metode bayar
 * lewat queue "Pending Vendor/HPP": recompute HPP, post keuangan [REF:itemId],
 * buat PO maklon, lalu set pending_vendor_hpp=0.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
    isCompositeTransactionAtomic: async () => false,
  };
});

const createMaklonPurchaseMock = jest.fn();
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: (...args: any[]) => createMaklonPurchaseMock(...args),
  deleteMaklonPurchasesForSale: jest.fn(),
}));

jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: jest.fn().mockResolvedValue(undefined),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

const isDateInClosedPeriodMock = jest.fn();
jest.mock("@/lib/services/accounting-periods-service", () => ({
  __esModule: true,
  isDateInClosedPeriod: (...args: any[]) => isDateInClosedPeriodMock(...args),
}));

import {
  reconcilePendingMaklonItem,
  listPendingMaklon,
} from "../services/pending-maklon-service";

beforeEach(() => {
  resetMockDb();
  createMaklonPurchaseMock.mockReset().mockResolvedValue({ id: "po-1" });
  isDateInClosedPeriodMock.mockReset().mockResolvedValue(false);
});

describe("reconcilePendingMaklonItem", () => {
  it("update vendor+biaya, set pending_vendor_hpp=0, recompute HPP, post keuangan [REF], create PO", async () => {
    mockTable("item_penjualan").set("it-1", {
      id: "it-1",
      penjualan_id: "s1",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 1,
      katalog_maklon_id: "km-1",
      harga_satuan: 50000,
      jumlah: 1,
      subtotal: 50000,
      hpp_satuan: 0,
      hpp_total: 0,
      deskripsi_pekerjaan: "Banner custom",
    });
    mockTable("penjualan").set("s1", {
      id: "s1",
      nomor_faktur: "INV-001",
      tanggal: "2026-07-07",
    });

    await reconcilePendingMaklonItem("it-1", {
      vendor_subkontrak_id: "v1",
      biaya_subkontrak: 30000,
      metode_bayar_vendor: "CASH",
      dibuat_oleh: "u1",
    });

    const updated = mockTable("item_penjualan").get("it-1");
    expect(Number(updated.pending_vendor_hpp)).toBe(0);
    expect(Number(updated.hpp_total)).toBe(30000);
    expect(Number(updated.hpp_satuan)).toBe(30000);
    expect(updated.vendor_subkontrak_id).toBe("v1");
    expect(updated.metode_bayar_vendor).toBe("CASH");
    expect(Number(updated.gross_profit)).toBe(20000);

    const keuanganRows = Array.from(mockTable("keuangan").values());
    expect(
      keuanganRows.some((k) => (k.keperluan || "").includes("[REF:it-1]")),
    ).toBe(true);
    expect(createMaklonPurchaseMock).toHaveBeenCalledTimes(1);
    const poArg = createMaklonPurchaseMock.mock.calls[0][0];
    expect(poArg.vendorId).toBe("v1");
    expect(poArg.metodeBayar).toBe("CASH");
    expect(poArg.items[0].biaya_subkontrak).toBe(30000);
  });

  it("menolak reconcile saat tanggal sale di periode tertutup", async () => {
    mockTable("item_penjualan").set("it-2", {
      id: "it-2",
      penjualan_id: "s2",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 1,
      jumlah: 1,
      subtotal: 50000,
      hpp_satuan: 0,
      hpp_total: 0,
      deskripsi_pekerjaan: "Stiker custom",
    });
    mockTable("penjualan").set("s2", {
      id: "s2",
      nomor_faktur: "INV-002",
      tanggal: "2026-01-05",
    });
    isDateInClosedPeriodMock.mockResolvedValue(true);

    await expect(
      reconcilePendingMaklonItem("it-2", {
        vendor_subkontrak_id: "v1",
        biaya_subkontrak: 20000,
        metode_bayar_vendor: "CASH",
        dibuat_oleh: "u1",
      }),
    ).rejects.toThrow(/periode/i);
    expect(createMaklonPurchaseMock).not.toHaveBeenCalled();
  });

  it("menolak input biaya tidak valid", async () => {
    mockTable("item_penjualan").set("it-3", {
      id: "it-3",
      penjualan_id: "s3",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 1,
      jumlah: 1,
      subtotal: 50000,
      deskripsi_pekerjaan: "Banner",
    });
    mockTable("penjualan").set("s3", {
      id: "s3",
      nomor_faktur: "INV-003",
      tanggal: "2026-07-07",
    });
    await expect(
      reconcilePendingMaklonItem("it-3", {
        vendor_subkontrak_id: "v1",
        biaya_subkontrak: 0,
        metode_bayar_vendor: "CASH",
        dibuat_oleh: "u1",
      }),
    ).rejects.toThrow();
    expect(createMaklonPurchaseMock).not.toHaveBeenCalled();
  });
});

describe("listPendingMaklon", () => {
  it("mengembalikan baris pending + join penjualan", async () => {
    mockTable("item_penjualan").set("it-a", {
      id: "it-a",
      penjualan_id: "s1",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 1,
      jumlah: 2,
      subtotal: 100000,
      deskripsi_pekerjaan: "Banner A",
    });
    mockTable("item_penjualan").set("it-b", {
      id: "it-b",
      penjualan_id: "s1",
      tipe_item: "MAKLON",
      pending_vendor_hpp: 0,
      jumlah: 1,
      subtotal: 50000,
      deskripsi_pekerjaan: "Banner B",
    });
    mockTable("penjualan").set("s1", {
      id: "s1",
      nomor_faktur: "INV-001",
      tanggal: "2026-07-07",
      pelanggan_nama_snapshot: "Toko Maju",
    });

    const rows = await listPendingMaklon();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("it-a");
    expect(rows[0].nomor_faktur).toBe("INV-001");
    expect(rows[0].pelanggan_nama).toBe("Toko Maju");
  });
});
