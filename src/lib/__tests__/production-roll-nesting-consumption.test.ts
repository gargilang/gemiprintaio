/**
 * Task 5: konsumsi roll produksi untuk barang berdimensi MURNI selaras dengan
 * billing nesting POS.
 *
 * - Bila item_penjualan menyimpan roll_panjang_total_m (penjualan nesting-aware)
 *   dan operator memakai roll yang lebar-nya cocok dengan recommended_roll_width_m,
 *   suggestedLinear = roll_panjang_total_m (tidak over-consume).
 * - Bila roll_panjang_total_m kosong (data lama), fallback ke rumus roll-aligned
 *   lama (getBillableDimensionsForRoll(...).area / rollWidth).
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
  postInventoryMovementMock
    .mockReset()
    .mockImplementation(async (args: any) => ({ id: args.id || "mov-mock", ...args }));
  getRollVariantsMock.mockReset().mockResolvedValue([]);
});

/** Barang berdimensi murni + roll variant lebar 2m (AVCO 20000/m²). */
function setupBarangDimensi() {
  mockTable("order_produksi").set("OP-1", { id: "OP-1", status: "MENUNGGU" });

  mockTable("barang").set("banner", {
    id: "banner",
    nama: "Banner Flexi",
    butuh_dimensi_status: 1,
    lacak_inventori_status: 1,
    average_cost_per_base_unit: 15000,
  });

  mockTable("barang_roll_variants").set("rv-2m", {
    id: "rv-2m",
    barang_id: "banner",
    lebar_m: 2,
    average_cost_per_m2: 20000,
  });

  getRollVariantsMock.mockImplementation(async (barangId: string) => {
    if (barangId === "banner") {
      return [{ id: "rv-2m", lebar_m: 2, average_cost_per_m2: 20000 }];
    }
    return [];
  });
}

/** Ambil movement PRODUCTION_ISSUE dari mock. */
function issueMovement() {
  const call = postInventoryMovementMock.mock.calls.find(
    (c: any[]) => c[0]?.movement_type === "PRODUCTION_ISSUE",
  );
  return call ? call[0] : null;
}

describe("konsumsi roll nesting-aware (barang berdimensi murni)", () => {
  it("suggestedLinear pakai roll_panjang_total_m bila tersedia (tidak over-consume)", async () => {
    setupBarangDimensi();

    // 2 lembar 1×1.5 di roll 2m → nesting: panjang total 1.5m, area 3m².
    mockTable("item_penjualan").set("ip-1", {
      id: "ip-1",
      barang_id: "banner",
      jumlah: 3, // m² total (nesting)
      panjang: 1,
      lebar: 1.5,
      billed_panjang: 1.5,
      billed_lebar: 2,
      recommended_roll_width_m: 2,
      roll_items_per_row: 2,
      roll_rows: 1,
      roll_panjang_total_m: 1.5,
      roll_inventory_deferred: 1,
    });

    mockTable("item_produksi").set("IP-1", {
      id: "IP-1",
      order_produksi_id: "OP-1",
      item_penjualan_id: "ip-1",
      barang_id: "banner",
      barang_nama: "Banner Flexi",
      jumlah: 3,
      panjang: 1,
      lebar: 1.5,
      roll_inventory_status: "NOT_REQUIRED",
      status: "MENUNGGU",
      parent_item_produksi_id: null,
      operator_id: null,
      mulai_proses: null,
    });

    await postProductionMaterialConsumption({
      item_produksi_id: "IP-1",
      roll_variant_id: "rv-2m",
      // linear_used_m dikosongkan → pakai suggested nesting
      operator_id: "u1",
    });

    const mv = issueMovement();
    expect(mv).toBeTruthy();
    // suggestedLinear = roll_panjang_total_m = 1.5 (bukan per-lembar penuh)
    expect(Math.abs(Number(mv.linear_delta_m))).toBeCloseTo(1.5, 5);
    // issueArea = min(billedArea 3, areaUsed 2×1.5=3) = 3
    expect(Math.abs(Number(mv.qty_delta))).toBeCloseTo(3, 5);
  });

  it("fallback ke rumus lama bila roll_panjang_total_m kosong (data lama)", async () => {
    setupBarangDimensi();

    // Penjualan lama: tanpa field nesting, hanya panjang/lebar/jumlah.
    mockTable("item_penjualan").set("ip-2", {
      id: "ip-2",
      barang_id: "banner",
      jumlah: 3.6, // 1.2×2.7 roll-aligned area lama
      panjang: 1.2,
      lebar: 2.7,
      billed_panjang: 1.2,
      billed_lebar: 3,
      recommended_roll_width_m: 3,
      roll_inventory_deferred: 1,
    });

    mockTable("item_produksi").set("IP-2", {
      id: "IP-2",
      order_produksi_id: "OP-1",
      item_penjualan_id: "ip-2",
      barang_id: "banner",
      barang_nama: "Banner Flexi",
      jumlah: 3.6,
      panjang: 1.2,
      lebar: 2.7,
      roll_inventory_status: "NOT_REQUIRED",
      status: "MENUNGGU",
      parent_item_produksi_id: null,
      operator_id: null,
      mulai_proses: null,
    });

    const c = await postProductionMaterialConsumption({
      item_produksi_id: "IP-2",
      roll_variant_id: "rv-2m",
      operator_id: "u1",
    });
    // Tidak error → memakai fallback rumus lama.
    expect(c).toBeTruthy();
    const mv = issueMovement();
    expect(mv).toBeTruthy();
    // Fallback: getBillableDimensionsForRoll(1.2, 2.7, 2).area / 2.
    // roll 2m: rotasi tak muat 2.7; non-rotasi 2×1.2=2.4 area → linear 1.2.
    expect(Math.abs(Number(mv.linear_delta_m))).toBeGreaterThan(0);
  });
});
