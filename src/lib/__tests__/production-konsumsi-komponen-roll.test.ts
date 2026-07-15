/**
 * Test konfirmasi roll untuk baris anak komponen rakitan (Task 4 & 5).
 *
 * Skenario: baris item_produksi anak (parent_item_produksi_id terisi,
 * barang_id=flexi-280, panjang/lebar, roll_inventory_status=PENDING)
 * dikonfirmasi via postProductionMaterialConsumption → stok flexi dipotong
 * roll-aligned, status baris anak jadi POSTED.
 *
 * Task 5: setelah konfirmasi roll, hpp_total item_penjualan induk ikut
 * terupdate dari biaya aktual konsumsi roll.
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
  };
});

const postInventoryMovementMock = jest.fn();
const getRollVariantsMock = jest.fn();
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getRollVariants: (...args: any[]) => getRollVariantsMock(...args),
}));

jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(async () => ({})),
}));

import { postProductionMaterialConsumption } from "../services/production-service";

beforeEach(() => {
  resetMockDb();
  postInventoryMovementMock.mockReset().mockImplementation(async (args: any) => ({
    id: args.id || "mov-mock",
    ...args,
  }));
  getRollVariantsMock.mockReset().mockResolvedValue([]);
});

/** Setup data dasar untuk baris anak komponen rakitan */
function setupKomponenRoll() {
  // order_produksi
  mockTable("order_produksi").set("OP-1", {
    id: "OP-1",
    status: "MENUNGGU",
  });

  // item_penjualan induk (barang induk Kaki Roll Banner, non-dimensi)
  mockTable("item_penjualan").set("ip-induk", {
    id: "ip-induk",
    barang_id: "kaki-roll",
    jumlah: 1,
    subtotal: 100000,
    hpp_total: 0,
    hpp_satuan: 0,
    gross_profit: 100000,
    gross_margin: 100,
    roll_inventory_deferred: 0, // induk non-dimensi, tidak ada defer roll
  });

  // Barang induk (non-dimensi) — dipakai saleItem.barang_id pada resolver lama
  mockTable("barang").set("kaki-roll", {
    id: "kaki-roll",
    nama: "Kaki Roll Banner",
    butuh_dimensi_status: 0,
    lacak_inventori_status: 1,
    average_cost_per_base_unit: 0,
  });

  // Barang komponen berdimensi
  mockTable("barang").set("flexi-280", {
    id: "flexi-280",
    nama: "Flexi 280",
    butuh_dimensi_status: 1,
    lacak_inventori_status: 1,
    average_cost_per_base_unit: 15000,
  });

  // item_produksi induk
  mockTable("item_produksi").set("IP-1", {
    id: "IP-1",
    order_produksi_id: "OP-1",
    item_penjualan_id: "ip-induk",
    barang_id: "kaki-roll",
    barang_nama: "Kaki Roll Banner",
    jumlah: 1,
    panjang: null,
    lebar: null,
    roll_inventory_status: "NOT_REQUIRED",
    status: "MENUNGGU",
    parent_item_produksi_id: null,
    operator_id: null,
    mulai_proses: null,
  });

  // item_produksi ANAK (komponen Flexi 280, PENDING)
  mockTable("item_produksi").set("IP-1-komp-bk-flexi", {
    id: "IP-1-komp-bk-flexi",
    order_produksi_id: "OP-1",
    item_penjualan_id: "ip-induk", // berbagi item_penjualan dengan induk
    parent_item_produksi_id: "IP-1",
    barang_id: "flexi-280",
    barang_nama: "Flexi 280",
    jumlah: 0.78, // 1 × 1.3 × 0.6 = 0.78 m²
    nama_satuan: "m²",
    panjang: 1.3,
    lebar: 0.6,
    recommended_roll_width_m: 0.914,
    roll_inventory_status: "PENDING",
    status: "MENUNGGU",
    operator_id: null,
    mulai_proses: null,
  });

  // Roll variant untuk Flexi 280 (lebar 0.914m, AVCO = 20000/m²)
  mockTable("barang_roll_variants").set("rv-flexi-914", {
    id: "rv-flexi-914",
    barang_id: "flexi-280",
    lebar_m: 0.914,
    average_cost_per_m2: 20000,
  });

  getRollVariantsMock.mockImplementation(async (barangId: string) => {
    if (barangId === "flexi-280") {
      return [{ id: "rv-flexi-914", lebar_m: 0.914, average_cost_per_m2: 20000 }];
    }
    return [];
  });
}

describe("konfirmasi roll baris anak komponen rakitan", () => {
  it("memotong stok flexi roll-aligned, status baris anak jadi POSTED", async () => {
    setupKomponenRoll();

    await postProductionMaterialConsumption({
      item_produksi_id: "IP-1-komp-bk-flexi",
      roll_variant_id: "rv-flexi-914",
      linear_used_m: 1.3,
      operator_id: "u1",
    });

    // Harus ada movement PRODUCTION_ISSUE untuk flexi-280
    const callsForFlexi = postInventoryMovementMock.mock.calls.filter(
      (call: any[]) =>
        call[0]?.barang_id === "flexi-280" &&
        call[0]?.movement_type === "PRODUCTION_ISSUE",
    );
    expect(callsForFlexi).toHaveLength(1);
    expect(callsForFlexi[0][0].roll_variant_id).toBe("rv-flexi-914");
    expect(Number(callsForFlexi[0][0].roll_width_m)).toBeCloseTo(0.914);

    // Baris anak harus POSTED
    const anak = mockTable("item_produksi").get("IP-1-komp-bk-flexi");
    expect(anak.roll_inventory_status).toBe("POSTED");
  });

  it("melempar error jika item bukan komponen rakitan (bukan PENDING) dan induk tidak punya roll deferred", async () => {
    setupKomponenRoll();

    // Coba konfirmasi baris INDUK (bukan anak, tidak punya roll deferred)
    await expect(
      postProductionMaterialConsumption({
        item_produksi_id: "IP-1",
        roll_variant_id: "rv-flexi-914",
        linear_used_m: 1.3,
        operator_id: "u1",
      }),
    ).rejects.toThrow(/konfirmasi roll/i);
  });

  it("melempar error jika roll_variant_id bukan milik barang komponen", async () => {
    setupKomponenRoll();

    await expect(
      postProductionMaterialConsumption({
        item_produksi_id: "IP-1-komp-bk-flexi",
        roll_variant_id: "rv-invalid",
        linear_used_m: 1.3,
        operator_id: "u1",
      }),
    ).rejects.toThrow(/varian roll/i);
  });
});

describe("sinkron HPP komponen roll ke item_penjualan induk (Task 5)", () => {
  it("hpp_total item_penjualan induk terupdate dari biaya aktual konsumsi roll", async () => {
    setupKomponenRoll();

    await postProductionMaterialConsumption({
      item_produksi_id: "IP-1-komp-bk-flexi",
      roll_variant_id: "rv-flexi-914",
      linear_used_m: 1.3, // area = 0.914 × 1.3 ≈ 1.188 m²
      operator_id: "u1",
    });

    const ip = mockTable("item_penjualan").get("ip-induk");
    // HPP harus lebih besar dari 0 (terupdate dari biaya roll)
    expect(Number(ip.hpp_total)).toBeGreaterThan(0);
    // gross_profit = subtotal - hpp_total
    expect(Number(ip.gross_profit)).toBeCloseTo(
      Number(ip.subtotal) - Number(ip.hpp_total),
      0,
    );
  });
});
