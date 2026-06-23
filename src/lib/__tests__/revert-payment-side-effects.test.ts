/**
 * Revert pembayaran — piutang (penjualan) & hutang (pembelian).
 *
 * Coverage:
 *   - revertSalePayment: hapus pelunasan_piutang, hapus baris kas LUNAS/PIUTANG
 *     yang match faktur, reset piutang ke AKTIF.
 *   - revertPayment (hutang): hapus pelunasan_hutang, hapus baris kas SUPPLY
 *     match faktur, reset hutang ke AKTIF + pembelian ke HUTANG.
 *   - Guard: revertPayment tolak metode TUNAI / non-LUNAS.
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

jest.mock("@/lib/feature-flags", () => ({
  __esModule: true,
  usePgCompositeRpc: () => false,
}));

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { revertSalePayment } from "../services/pos-mutations";
import { revertPayment } from "../services/purchases-mutations";

beforeEach(() => {
  resetMockDb();
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
});

describe("revertSalePayment (piutang)", () => {
  test("hapus pelunasan + kas, reset piutang ke AKTIF", async () => {
    mockTable("penjualan").set("S1", {
      id: "S1",
      nomor_faktur: "INV-1",
      status_transaksi: "POSTED",
    });
    mockTable("piutang_penjualan").set("PI1", {
      id: "PI1",
      id_penjualan: "S1",
      jumlah_piutang: 100000,
      jumlah_terbayar: 100000,
      sisa_piutang: 0,
      status: "LUNAS",
    });
    mockTable("pelunasan_piutang").set("PP1", {
      id: "PP1",
      id_piutang: "PI1",
      jumlah: 100000,
    });
    mockTable("keuangan").set("K1", {
      id: "K1",
      kategori_transaksi: "LUNAS",
      keperluan: "Pelunasan piutang INV-1",
      debit: 100000,
    });

    const deleted = await revertSalePayment({ sale_id: "S1" });

    expect(deleted).toBe(1);
    expect(mockTable("pelunasan_piutang").size).toBe(0);
    expect(mockTable("keuangan").size).toBe(0);
    const piutang = mockTable("piutang_penjualan").get("PI1");
    expect(piutang.sisa_piutang).toBe(100000);
    expect(piutang.jumlah_terbayar).toBe(0);
    expect(piutang.status).toBe("AKTIF");
  });

  test("tolak bila tidak ada pembayaran piutang", async () => {
    mockTable("penjualan").set("S2", { id: "S2", nomor_faktur: "INV-2" });
    mockTable("piutang_penjualan").set("PI2", {
      id: "PI2",
      id_penjualan: "S2",
      jumlah_piutang: 50000,
      sisa_piutang: 50000,
      status: "AKTIF",
    });
    await expect(revertSalePayment({ sale_id: "S2" })).rejects.toThrow(
      /tidak ada catatan pembayaran/i
    );
  });
});

describe("revertPayment (hutang)", () => {
  test("hapus pelunasan + kas, reset hutang ke AKTIF + pembelian ke HUTANG", async () => {
    mockTable("pembelian").set("P1", {
      id: "P1",
      nomor_faktur: "FP-1",
      nomor_pembelian: "PO-1",
      metode_pembayaran: "NET30",
      status_pembayaran: "LUNAS",
      total_jumlah: 80000,
      jumlah_dibayar: 80000,
    });
    mockTable("hutang_pembelian").set("H1", {
      id: "H1",
      id_pembelian: "P1",
      jumlah_hutang: 80000,
      jumlah_terbayar: 80000,
      sisa_hutang: 0,
      status: "LUNAS",
    });
    mockTable("pelunasan_hutang").set("PH1", {
      id: "PH1",
      id_hutang: "H1",
      jumlah: 80000,
    });
    mockTable("keuangan").set("K1", {
      id: "K1",
      kategori_transaksi: "SUPPLY",
      keperluan: "Bayar hutang FP-1",
      debit: 80000,
    });

    const res = await revertPayment("P1");

    expect(res.payments_deleted).toBe(1);
    expect(mockTable("pelunasan_hutang").size).toBe(0);
    expect(mockTable("keuangan").size).toBe(0);
    const hutang = mockTable("hutang_pembelian").get("H1");
    expect(hutang.sisa_hutang).toBe(80000);
    expect(hutang.jumlah_terbayar).toBe(0);
    expect(hutang.status).toBe("AKTIF");
    const pembelian = mockTable("pembelian").get("P1");
    expect(pembelian.jumlah_dibayar).toBe(0);
    expect(pembelian.status_pembayaran).toBe("HUTANG");
  });

  test("tolak revert pembelian metode TUNAI", async () => {
    mockTable("pembelian").set("P2", {
      id: "P2",
      nomor_faktur: "FP-2",
      metode_pembayaran: "CASH",
      status_pembayaran: "LUNAS",
      total_jumlah: 30000,
      jumlah_dibayar: 30000,
    });
    await expect(revertPayment("P2")).rejects.toThrow(/TUNAI/i);
  });
});
