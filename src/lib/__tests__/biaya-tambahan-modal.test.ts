/**
 * Biaya tambahan dengan porsi modal (pengeluaran pihak ketiga).
 *
 * Modal per baris biaya tambahan dicatat sebagai pengeluaran kas kategori
 * BIAYA (token [REF:saleId]) saat transaksi dibuat, sisanya tetap omzet.
 * Modal juga membebani hpp_total/gross_profit item terkait (margin akurat)
 * tanpa dobel di agregat kas HPP.
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

jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createMaklonPurchase: jest.fn(),
  deleteMaklonPurchasesForSale: jest.fn(),
}));
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: jest.fn().mockResolvedValue({}),
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
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: jest.fn().mockResolvedValue(undefined),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

import { createSale } from "../services/pos-service";
import { voidSale } from "../services/pos-mutations";

beforeEach(() => resetMockDb());

function saleWith(biaya: any[], metode = "CASH") {
  return {
    kasir_id: "u1",
    pelanggan_id: "p1",
    tanggal: "2026-07-11",
    total_jumlah: 80000,
    jumlah_dibayar: metode === "NET30" ? 0 : 80000,
    jumlah_kembalian: 0,
    metode_pembayaran: metode,
    items: [
      {
        tipe_item: "BARANG",
        barang_id: "b1",
        harga_satuan_id: "h1",
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 50000,
        jumlah: 1,
        subtotal: 50000,
        biaya_tambahan: biaya,
      },
    ],
  } as any;
}

describe("biaya tambahan modal -> keuangan", () => {
  it("modal > 0 -> baris keuangan BIAYA dengan [REF] & modal tersimpan", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    await createSale(
      saleWith([{ label: "Pasang bambu", nominal: 30000, modal: 15000 }]),
    );

    const rows = Array.from(mockTable("biaya_tambahan_penjualan").values());
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].modal)).toBe(15000);

    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.kategori_transaksi === "BIAYA");
    expect(biayaRow).toBeTruthy();
    expect(Number(biayaRow.kredit)).toBe(15000);
    expect(String(biayaRow.keperluan)).toContain("[REF:");
    expect(biayaRow.reference_type).toBe("SALE_EXTRA_COST");
  });

  it("modal 0 -> tidak ada baris keuangan BIAYA", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    await createSale(saleWith([{ label: "Editing", nominal: 20000 }]));
    const keu = Array.from(mockTable("keuangan").values());
    expect(keu.some((k) => k.kategori_transaksi === "BIAYA")).toBe(false);
  });

  it("NET30 -> modal tetap diposting saat transaksi dibuat", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    await createSale(
      saleWith([{ label: "Ongkir", nominal: 20000, modal: 20000 }], "NET30"),
    );
    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.kategori_transaksi === "BIAYA");
    expect(biayaRow).toBeTruthy();
    expect(Number(biayaRow.kredit)).toBe(20000);
  });
});

describe("biaya tambahan modal -> margin item", () => {
  it("modal membebani hpp_total & gross_profit item", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    // item subtotal 50000, HPP barang 0, biaya tambahan modal 15000
    await createSale(
      saleWith([{ label: "Pasang bambu", nominal: 30000, modal: 15000 }]),
    );

    const ip = Array.from(mockTable("item_penjualan").values())[0];
    expect(Number(ip.hpp_total)).toBe(15000);
    expect(Number(ip.gross_profit)).toBe(50000 - 15000);
  });

  it("tidak dobel di agregat kas: HPP row = HPP barang saja (0), BIAYA row = modal", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    await createSale(
      saleWith([{ label: "Pasang bambu", nominal: 30000, modal: 15000 }]),
    );
    const keu = Array.from(mockTable("keuangan").values());
    // HPP barang 0 -> tidak ada baris HPP; modal -> baris BIAYA 15000.
    const hppRow = keu.find((k) => k.kategori_transaksi === "HPP");
    expect(hppRow).toBeFalsy();
    const biayaRow = keu.find((k) => k.kategori_transaksi === "BIAYA");
    expect(Number(biayaRow.kredit)).toBe(15000);
  });
});

describe("void -> baris BIAYA modal ikut ter-void", () => {
  it("menandai VOIDED baris keuangan SALE_EXTRA_COST", async () => {
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("b1", {
      id: "b1",
      nama: "Banner",
      average_cost_per_base_unit: 0,
    });
    const res = await createSale(
      saleWith([{ label: "Ongkir", nominal: 20000, modal: 20000 }]),
    );
    const saleId = (res as any).id;

    await voidSale(saleId, "uji void", "u1");

    const keu = Array.from(mockTable("keuangan").values());
    const biayaRow = keu.find((k) => k.reference_type === "SALE_EXTRA_COST");
    expect(biayaRow).toBeTruthy();
    expect(biayaRow.status_transaksi).toBe("VOIDED");
  });
});
