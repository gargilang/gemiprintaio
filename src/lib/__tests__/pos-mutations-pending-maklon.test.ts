/**
 * Safeguard pending maklon di createSale (C2).
 *
 * Baris maklon tanpa vendor/biaya tidak boleh membatalkan checkout —
 * disimpan sebagai pending (pending_vendor_hpp=1), HPP=0, tanpa PO maklon,
 * tanpa item_produksi (SPK item). Reconcile vendor/HPP dilakukan terpisah.
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
    inv_reset: "daily",
    inv_padding: 3,
    inv_start_seq: 1,
    spk_prefix: "SPK",
    spk_format: "PREFIX-SEQ",
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

const baseSale = {
  kasir_id: "u1",
  pelanggan_id: "p1",
  tanggal: "2026-07-07",
  total_jumlah: 50000,
  jumlah_dibayar: 50000,
  jumlah_kembalian: 0,
  metode_pembayaran: "CASH" as const,
  items: [
    {
      tipe_item: "MAKLON" as const,
      barang_id: "barang-jasa-maklon",
      harga_satuan_id: "harga-jasa-maklon-pcs",
      nama_satuan: "pcs",
      faktor_konversi: 1,
      harga_satuan: 50000,
      jumlah: 1,
      subtotal: 50000,
      deskripsi_pekerjaan: "Banner custom pending",
      katalog_maklon_id: "km-1",
      // vendor_subkontrak_id & biaya_subkontrak TIDAK diisi → pending
    },
  ],
};

describe("pending maklon di createSale", () => {
  it("sukses dengan vendor/biaya kosong → pending_vendor_hpp=1, hpp=0, no PO, no SPK item", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale(baseSale as any);
    const items = Array.from(mockTable("item_penjualan").values());
    expect(items).toHaveLength(1);
    expect(Number(items[0].pending_vendor_hpp)).toBe(1);
    expect(items[0].katalog_maklon_id).toBe("km-1");
    expect(Number(items[0].hpp_total)).toBe(0);
    expect(createMaklonPurchaseMock).not.toHaveBeenCalled();
    // tidak ada item_produksi untuk pending maklon
    expect(Array.from(mockTable("item_produksi").values())).toHaveLength(0);
  });

  it("vendor+biaya terisi → pending_vendor_hpp=0, PO maklon dibuat, hpp_total tercatat", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    await createSale({
      ...baseSale,
      items: [
        {
          ...baseSale.items[0],
          vendor_subkontrak_id: "v1",
          biaya_subkontrak: 30000,
          metode_bayar_vendor: "CASH" as const,
        },
      ],
    } as any);
    const items = Array.from(mockTable("item_penjualan").values());
    expect(Number(items[0].pending_vendor_hpp)).toBe(0);
    expect(Number(items[0].hpp_total)).toBe(30000);
    expect(createMaklonPurchaseMock).toHaveBeenCalledTimes(1);
  });
});
