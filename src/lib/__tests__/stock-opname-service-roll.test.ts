// src/lib/__tests__/stock-opname-service-roll.test.ts

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

jest.mock("@/lib/services/accounting-periods-service", () => ({
  isDateInClosedPeriod: jest.fn().mockResolvedValue(false),
}));

jest.mock("@/lib/services/document-number-service", () => ({
  generateDailyDocumentNumber: jest.fn().mockResolvedValue("SO-20260701-001"),
  numeric: (n: unknown) => Number(n) || 0,
  todayJakarta: () => "2026-07-01",
}));

jest.mock("@/lib/services/materials-service", () => ({
  getMaterials: jest.fn(),
}));

import { getMaterials } from "@/lib/services/materials-service";
import {
  createStockOpname,
  updateStockOpnameCounts,
  postStockOpname,
} from "../services/stock-opname-service";

const mockGetMaterials = getMaterials as jest.Mock;

function seedDimensional() {
  // Barang dimensi dengan 2 variant aktif
  mockGetMaterials.mockResolvedValue([
    {
      id: "barang-roll",
      nama: "Bahan Roll A",
      satuan_dasar: "m²",
      jumlah_stok: 120,
      average_cost_per_base_unit: 5000,
      lacak_inventori_status: 1,
      butuh_dimensi_status: 1,
    },
  ]);
  mockTable("barang_roll_variants").set("var-1", {
    id: "var-1",
    barang_id: "barang-roll",
    lebar_m: 1.5,
    panjang_tersedia_m: 60,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
  mockTable("barang_roll_variants").set("var-2", {
    id: "var-2",
    barang_id: "barang-roll",
    lebar_m: 2,
    panjang_tersedia_m: 15,
    average_cost_per_m2: 5000,
    aktif_status: 1,
  });
}

describe("createStockOpname — barang dimensi", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("membuat 2 item opname (1 per variant) untuk barang dimensi", async () => {
    await createStockOpname({ tanggal: "2026-07-01" });

    const items = Array.from(mockTable("stock_opname_items").values());
    expect(items).toHaveLength(2);

    const item1 = items.find((i) => i.roll_variant_id === "var-1");
    const item2 = items.find((i) => i.roll_variant_id === "var-2");

    expect(item1).toBeDefined();
    expect(item1.roll_width_m).toBe(1.5);
    expect(item1.system_linear_m).toBe(60);
    expect(item1.system_qty).toBeCloseTo(90); // 60 × 1.5

    expect(item2).toBeDefined();
    expect(item2.roll_width_m).toBe(2);
    expect(item2.system_linear_m).toBe(15);
    expect(item2.system_qty).toBeCloseTo(30); // 15 × 2
  });
});

describe("updateStockOpnameCounts — counted_linear_m untuk dimensi", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("menghitung counted_qty dan delta_linear_m dari counted_linear_m", async () => {
    // Setup sesi opname
    const session = {
      id: "opname-1",
      nomor_opname: "SO-001",
      status: "DRAFT",
      tanggal: "2026-07-01",
    };
    mockTable("stock_opnames").set("opname-1", session);
    const item1 = {
      id: "item-1",
      stock_opname_id: "opname-1",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: null,
      delta_qty: 0,
      unit_cost: 5000,
      delta_value: 0,
    };
    mockTable("stock_opname_items").set("item-1", item1);

    await updateStockOpnameCounts("opname-1", [
      { stock_opname_item_id: "item-1", counted_linear_m: 55 },
    ]);

    const updated = mockTable("stock_opname_items").get("item-1");
    expect(updated.counted_linear_m).toBe(55);
    expect(updated.counted_qty).toBeCloseTo(82.5); // 55 × 1.5
    expect(updated.delta_qty).toBeCloseTo(-7.5); // 82.5 - 90
    expect(updated.delta_linear_m).toBeCloseTo(-5); // 55 - 60
  });
});

describe("postStockOpname — validasi sebelum posting", () => {
  beforeEach(() => {
    resetMockDb();
    seedDimensional();
  });

  it("menolak posting jika delta menyebabkan panjang_tersedia_m negatif", async () => {
    mockTable("stock_opnames").set("opname-bad", {
      id: "opname-bad",
      nomor_opname: "SO-002",
      status: "DRAFT",
      tanggal: "2026-07-01",
    });
    mockTable("stock_opname_items").set("item-bad", {
      id: "item-bad",
      stock_opname_id: "opname-bad",
      barang_id: "barang-roll",
      roll_variant_id: "var-1",
      roll_width_m: 1.5,
      system_qty: 90,
      system_linear_m: 60,
      counted_qty: -1.5,
      counted_linear_m: -1,
      delta_qty: -91.5,
      delta_linear_m: -61, // 60 tersedia, butuh 61 → harus DITOLAK
      unit_cost: 5000,
      delta_value: -457500,
    });
    mockTable("barang").set("barang-roll", {
      id: "barang-roll",
      jumlah_stok: 120,
      average_cost_per_base_unit: 5000,
      lacak_inventori_status: 1,
    });

    await expect(postStockOpname("opname-bad")).rejects.toThrow(
      /Roll lebar 1\.5/,
    );
  });
});
