/**
 * Test pembuatan baris item_produksi anak untuk komponen BOM berdimensi
 * saat checkout produk rakitan (C3).
 *
 * Skenario: barang induk "Kaki Roll Banner" (non-dimensi) dijual sebagai
 * produk "X Banner". BOM-nya mengandung komponen "Flexi 280" (berdimensi,
 * panjang=1.3m, lebar=1.8m, jumlah_roll=1). Saat createSale, selain
 * item_produksi induk, harus muncul baris anak dengan parent_item_produksi_id
 * terisi, barang_id=komponen, roll_inventory_status="PENDING".
 *
 * Stok komponen TIDAK dipotong saat checkout — hanya saat konfirmasi roll.
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

const getRollVariantsMock = jest.fn();
const postInventoryMovementMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getInventoryMovements: jest.fn().mockResolvedValue([]),
  rebuildInventoryBalance: jest.fn().mockResolvedValue(undefined),
  getRollVariants: (...args: any[]) => getRollVariantsMock(...args),
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
  // Default: tidak ada roll variant (diperlukan untuk komponen)
  getRollVariantsMock.mockReset().mockResolvedValue([]);
});

/** Setup data dasar untuk skenario produk rakitan */
function setupRakitanData() {
  // Pelanggan
  mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });

  // Barang induk: Kaki Roll Banner (non-dimensi, stok cukup)
  mockTable("barang").set("kaki-roll", {
    id: "kaki-roll",
    nama: "Kaki Roll Banner",
    butuh_dimensi_status: 0,
    lacak_inventori_status: 1,
    jumlah_stok: 100,
    average_cost_per_base_unit: 0,
  });

  // Barang komponen: Flexi 280 (berdimensi)
  mockTable("barang").set("flexi-280", {
    id: "flexi-280",
    nama: "Flexi 280",
    butuh_dimensi_status: 1,
    lacak_inventori_status: 1,
    jumlah_stok: 50,
    average_cost_per_base_unit: 15000,
  });

  // BOM: X Banner punya komponen Flexi 280 (scoped per unit_price)
  mockTable("barang_komponen").set("bk-flexi", {
    id: "bk-flexi",
    parent_barang_id: "kaki-roll",
    komponen_id: "flexi-280",
    qty: 1,
    jumlah_roll: 1,
    panjang: 1.3,
    lebar: 0.6,
    unit_price_id: "harga-xbanner",
    is_deleted: 0,
  });

  // Roll variant Flexi 280 (lebar 0.914m)
  getRollVariantsMock.mockImplementation(async (barangId: string) => {
    if (barangId === "flexi-280") {
      return [{ id: "rv-flexi-914", lebar_m: 0.914 }];
    }
    return [];
  });
}

/** Data penjualan dasar untuk produk rakitan non-dimensi */
const baseSaleRakitan = {
  kasir_id: "u1",
  pelanggan_id: "p1",
  tanggal: "2026-07-15",
  total_jumlah: 100000,
  jumlah_dibayar: 100000,
  jumlah_kembalian: 0,
  metode_pembayaran: "CASH" as const,
  items: [
    {
      tipe_item: "BARANG" as const,
      barang_id: "kaki-roll",
      harga_satuan_id: "harga-xbanner",
      nama_satuan: "pcs",
      faktor_konversi: 1,
      harga_satuan: 100000,
      jumlah: 1,
      subtotal: 100000,
    },
  ],
};

describe("createSale rakitan — baris anak komponen berdimensi", () => {
  it("membuat baris item_produksi anak untuk komponen BOM berdimensi", async () => {
    setupRakitanData();

    await createSale(baseSaleRakitan as any);

    const prodItems = Array.from(mockTable("item_produksi").values());
    // Harus ada 1 induk + 1 anak komponen
    const induk = prodItems.find((r: any) => !r.parent_item_produksi_id);
    const anak = prodItems.find((r: any) => r.parent_item_produksi_id);
    expect(induk).toBeTruthy();
    expect(anak).toBeTruthy();
    expect(anak.parent_item_produksi_id).toBe(induk.id);
    // Baris anak mengacu komponen berdimensi, bukan barang induk
    expect(anak.barang_id).toBe("flexi-280");
    // Status PENDING karena roll belum dikonfirmasi
    expect(anak.roll_inventory_status).toBe("PENDING");
  });

  it("baris anak menyimpan dimensi dan rekomendasi roll dari BOM", async () => {
    setupRakitanData();

    await createSale(baseSaleRakitan as any);

    const prodItems = Array.from(mockTable("item_produksi").values());
    const anak = prodItems.find((r: any) => r.parent_item_produksi_id);
    expect(anak).toBeTruthy();
    // Dimensi dari BOM (panjang=1.3, lebar=0.6)
    expect(Number(anak.panjang)).toBeCloseTo(1.3);
    expect(Number(anak.lebar)).toBeCloseTo(0.6);
    // Rekomendasi roll dari variant yang tersedia (lebar 0.914 ≥ 0.6)
    expect(Number(anak.recommended_roll_width_m)).toBeCloseTo(0.914);
    // Jumlah m² = jumlah_roll × panjang × lebar = 1 × 1.3 × 0.6 = 0.78
    expect(Number(anak.jumlah)).toBeCloseTo(0.78);
  });

  it("stok komponen TIDAK dipotong saat checkout (hanya saat konfirmasi roll)", async () => {
    setupRakitanData();

    await createSale(baseSaleRakitan as any);

    // Tidak boleh ada inventory_movements dengan qty negatif untuk flexi-280
    const issues = Array.from(mockTable("inventory_movements").values()).filter(
      (m: any) => m.barang_id === "flexi-280" && Number(m.qty_delta) < 0,
    );
    expect(issues).toHaveLength(0);
  });

  it("barang tanpa BOM berdimensi tidak membuat baris anak", async () => {
    // Setup: barang biasa tanpa BOM
    mockTable("pelanggan").set("p1", { id: "p1", nama: "Walk-in" });
    mockTable("barang").set("barang-biasa", {
      id: "barang-biasa",
      nama: "Barang Biasa",
      butuh_dimensi_status: 0,
      lacak_inventori_status: 1,
      jumlah_stok: 100,
      average_cost_per_base_unit: 0,
    });
    // Tidak ada barang_komponen untuk barang-biasa

    const sale = {
      ...baseSaleRakitan,
      items: [
        {
          ...baseSaleRakitan.items[0],
          barang_id: "barang-biasa",
          harga_satuan_id: "harga-biasa",
        },
      ],
    };

    await createSale(sale as any);

    const prodItems = Array.from(mockTable("item_produksi").values());
    // Hanya 1 baris (induk), tidak ada anak
    expect(prodItems).toHaveLength(1);
    expect(prodItems[0].parent_item_produksi_id).toBeFalsy();
  });
});
