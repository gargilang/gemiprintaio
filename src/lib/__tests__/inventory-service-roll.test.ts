import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

jest.mock("@/lib/services/accounting-periods-service", () => ({
  isDateInClosedPeriod: jest.fn().mockResolvedValue(false),
}));

import {
  createInventoryAdjustment,
  createWasteMovement,
} from "../services/inventory-service";

function seedBarangDimensi() {
  mockTable("barang").set("barang-roll-1", {
    id: "barang-roll-1",
    nama: "Bahan Roll A",
    jumlah_stok: 90,
    average_cost_per_base_unit: 5000,
    lacak_inventori_status: 1,
    butuh_dimensi_status: 1,
  });
  mockTable("barang_roll_variants").set("variant-1", {
    id: "variant-1",
    barang_id: "barang-roll-1",
    lebar_m: 1.5,
    panjang_tersedia_m: 60,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
}

describe("createInventoryAdjustment dengan roll params", () => {
  beforeEach(() => {
    resetMockDb();
    seedBarangDimensi();
  });

  it("meneruskan roll_variant_id dan linear_delta_m ke movement", async () => {
    const result = await createInventoryAdjustment({
      barang_id: "barang-roll-1",
      qty_delta: -22.5,
      reason: "Koreksi stok",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements).toHaveLength(1);
    expect(movements[0].roll_variant_id).toBe("variant-1");
    expect(movements[0].roll_width_m).toBe(1.5);
    expect(movements[0].linear_delta_m).toBe(-15);
    expect(movements[0].qty_delta).toBeCloseTo(-22.5);
  });

  it("update panjang_tersedia_m pada variant setelah adjustment pengurangan", async () => {
    await createInventoryAdjustment({
      barang_id: "barang-roll-1",
      qty_delta: -22.5,
      reason: "Koreksi",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: -15,
    });

    const variant = mockTable("barang_roll_variants").get("variant-1");
    expect(variant.panjang_tersedia_m).toBeCloseTo(45); // 60 - 15
  });

  it("tetap berjalan tanpa roll params untuk barang non-dimensi", async () => {
    mockTable("barang").set("barang-biasa", {
      id: "barang-biasa",
      nama: "Tinta Hitam",
      jumlah_stok: 10,
      average_cost_per_base_unit: 50000,
      lacak_inventori_status: 1,
      butuh_dimensi_status: 0,
    });

    const result = await createInventoryAdjustment({
      barang_id: "barang-biasa",
      qty_delta: -2,
      reason: "Adjustment biasa",
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements[0].roll_variant_id).toBeNull();
  });
});

describe("createWasteMovement dengan roll params", () => {
  beforeEach(() => {
    resetMockDb();
    seedBarangDimensi();
  });

  it("meneruskan roll params ke movement dan qty_delta negatif", async () => {
    const result = await createWasteMovement({
      barang_id: "barang-roll-1",
      qty: 22.5,
      reason: "Misprint",
      roll_variant_id: "variant-1",
      roll_width_m: 1.5,
      linear_delta_m: 15,
    });

    expect(result).not.toBeNull();
    const movements = Array.from(mockTable("inventory_movements").values());
    expect(movements[0].qty_delta).toBeCloseTo(-22.5);
    expect(movements[0].roll_variant_id).toBe("variant-1");
    expect(movements[0].linear_delta_m).toBe(-15); // service membalik ke negatif
  });
});
