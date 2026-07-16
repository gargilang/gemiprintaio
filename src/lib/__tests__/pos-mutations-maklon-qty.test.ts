/**
 * Biaya subkontrak maklon dengan qty > 1 (Katalog Extra).
 *
 * KONTRAK DATA: POS mengirim `biaya_subkontrak` sebagai harga PER LEMBAR
 * (langsung dari `biaya_subkontrak_default` katalog, tanpa dikali qty).
 * Backend WAJIB mengalikannya dengan `jumlah` untuk mendapat total biaya
 * subkontrak yang dibayar ke vendor.
 *
 * Bug historis: backend memperlakukan `biaya_subkontrak` sebagai TOTAL,
 * sehingga untuk qty>1 biaya subkontrak (dan HPP) hanya tercatat 1× lembar.
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

const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getInventoryMovements: jest.fn().mockResolvedValue([]),
  rebuildInventoryBalance: jest.fn().mockResolvedValue(undefined),
  getRollVariants: jest.fn().mockResolvedValue([]),
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
    spk_date_format: "YYYYMMDD",
    spk_reset: "never",
    spk_padding: 4,
    spk_start_seq: 1,
  }),
}));

const recalculateCashbookMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { createSale } from "../services/pos-service";

beforeEach(() => {
  resetMockDb();
  createMaklonPurchaseMock.mockReset().mockResolvedValue({ id: "po-1" });
  postInventoryMovementMock.mockReset().mockResolvedValue({});
  recalculateCashbookMock.mockReset().mockResolvedValue(undefined);
});

const saleWithMaklonQty = (jumlah: number, biayaPerLbr: number) => ({
  kasir_id: "u1",
  pelanggan_id: "p1",
  tanggal: "2026-07-07",
  total_jumlah: 13000 * jumlah,
  jumlah_dibayar: 13000 * jumlah,
  jumlah_kembalian: 0,
  metode_pembayaran: "TRANSFER" as const,
  items: [
    {
      tipe_item: "MAKLON" as const,
      barang_id: "barang-jasa-maklon",
      harga_satuan_id: "harga-jasa-maklon-pcs",
      nama_satuan: "Lbr",
      faktor_konversi: 1,
      harga_satuan: 13000,
      jumlah,
      subtotal: 13000 * jumlah,
      deskripsi_pekerjaan: "Print Stiker Vinyl A3+",
      katalog_maklon_id: "km-1",
      vendor_subkontrak_id: "v1",
      // POS mengirim biaya PER LEMBAR (dari katalog), bukan total
      biaya_subkontrak: biayaPerLbr,
      metode_bayar_vendor: "TRANSFER" as const,
    },
  ],
});

describe("maklon qty > 1: biaya_subkontrak dikali qty", () => {
  it("qty=2 @ 10000/lbr → hpp_total=20000, hpp_satuan=10000", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale(saleWithMaklonQty(2, 10000) as any);

    const items = Array.from(mockTable("item_penjualan").values());
    expect(items).toHaveLength(1);
    // 2 lembar × 10000 = 20000 biaya subkontrak total
    expect(Number(items[0].hpp_total)).toBe(20000);
    expect(Number(items[0].hpp_satuan)).toBe(10000);
    expect(Number(items[0].gross_profit)).toBe(26000 - 20000); // 6000
  });

  it("createMaklonPurchase menerima biaya_subkontrak TOTAL (per-lembar × qty)", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale(saleWithMaklonQty(2, 10000) as any);

    expect(createMaklonPurchaseMock).toHaveBeenCalledTimes(1);
    const arg = createMaklonPurchaseMock.mock.calls[0][0];
    expect(arg.items).toHaveLength(1);
    expect(arg.items[0].jumlah).toBe(2);
    // total biaya subkontrak yang masuk ke keuangan/hutang = 20000
    expect(arg.items[0].biaya_subkontrak).toBe(20000);
  });

  it("qty=1 tetap benar (regresi): hpp_total=10000, hpp_satuan=10000", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale(saleWithMaklonQty(1, 10000) as any);

    const items = Array.from(mockTable("item_penjualan").values());
    expect(Number(items[0].hpp_total)).toBe(10000);
    expect(Number(items[0].hpp_satuan)).toBe(10000);
    const arg = createMaklonPurchaseMock.mock.calls[0][0];
    expect(arg.items[0].biaya_subkontrak).toBe(10000);
  });
});
