// @jest-environment node
/**
 * Test HPP BOM (B2.f) — helper computeBomCostPerUnit di bom-service.ts.
 *
 * createSaleAttempt terlalu besar untuk di-test integrasi penuh (NSFP, stok,
 * SPK, period close). Spec (Plan B Task 7) mengizinkan ekstraksi helper
 * `computeBomCostPerUnit(barangId, unitPriceId)` yang di-test terpisah, lalu
 * createSaleAttempt cukup memanggil helper. Test ini memverifikasi rumus:
 *   bomCostPerUnit = Σ(AVCO komponen × qty per unit produk jual)
 * termasuk fallback AVCO ke harga_barang_satuan dan komponen berdimensi (m²).
 *
 * Resolver resolveBomForUnitPrice TIDAK di-mock — helper memakai resolver
 * asli, dan db.query untuk barang_komponen di-mock supaya resolusi scope
 * teruji secara bersamaan.
 */

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: mockQuery,
    queryOne: mockQueryOne,
    insert: jest.fn(),
    update: jest.fn(),
  },
  generateId: jest.fn(() => "mock-id"),
  getCurrentTimestamp: jest.fn(() => "2026-01-01T00:00:00Z"),
}));

import { computeBomCostPerUnit } from "@/lib/services/bom-service";

/**
 * Helper: mock db.query("barang_komponen", ...) supaya return rows sesuai
 * filter unit_price_id (scope per-produk-jual vs barang-level null).
 */
function mockBarangKomponen(scopedRows: any[], barangLevelRows: any[] = []) {
  mockQuery.mockImplementation(async (table: string, opts?: any) => {
    if (table === "barang_komponen") {
      const upid = opts?.where?.unit_price_id;
      if (upid === null) return { data: barangLevelRows, error: null };
      return { data: scopedRows, error: null };
    }
    if (table === "harga_barang_satuan") {
      return {
        data: [
          {
            id: "hps-1",
            faktor_konversi: 1,
            harga_beli: 5000,
            default_status: 1,
          },
        ],
        error: null,
      };
    }
    return { data: [], error: null };
  });
}

describe("computeBomCostPerUnit — HPP BOM (B2.f)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("mengembalikan Σ AVCO × qty per unit untuk komponen BOM", async () => {
    mockBarangKomponen([
      {
        id: "bk-1",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-kaki",
        qty: 2,
        is_deleted: 0,
      },
      {
        id: "bk-2",
        parent_barang_id: "b-xbanner",
        komponen_id: "b-sekrup",
        qty: 4,
        is_deleted: 0,
      },
    ]);
    // AVCO komponen diambil dari tabel barang.
    mockQueryOne.mockImplementation(async (table: string, opts: any) => {
      if (table === "barang") {
        const id = opts?.where?.id;
        const avco = id === "b-kaki" ? 1500 : 200;
        return { data: { id, average_cost_per_base_unit: avco }, error: null };
      }
      return { data: null, error: null };
    });

    const cost = await computeBomCostPerUnit("b-xbanner", "up-xbanner");
    // 1500×2 + 200×4 = 3000 + 800 = 3800
    expect(cost).toBe(3800);
  });

  it("mengembalikan 0 jika BOM kosong (tidak ada scope)", async () => {
    mockBarangKomponen([], []);
    const cost = await computeBomCostPerUnit("b-plain", "up-plain");
    expect(cost).toBe(0);
    expect(mockQueryOne).not.toHaveBeenCalled();
  });

  it("fallback ke harga_barang_satuan + komponen berdimensi (m²)", async () => {
    // unitPriceId null → hanya query scope barang-level.
    mockBarangKomponen(
      [],
      [
        {
          id: "bk-1",
          parent_barang_id: "b-vinyl",
          komponen_id: "b-vinyl-roll",
          qty: 1,
          jumlah_roll: 1,
          panjang: 3,
          lebar: 2,
          is_deleted: 0,
        },
      ],
    );
    // average_cost_per_base_unit kosong → fallback ke harga_barang_satuan.
    mockQueryOne.mockResolvedValue({
      data: { id: "b-vinyl-roll", average_cost_per_base_unit: 0 },
      error: null,
    });

    const cost = await computeBomCostPerUnit("b-vinyl", null);
    // Komponen berdimensi: 1 roll × 3m × 2m = 6 m²; AVCO fallback 5000/1 = 5000.
    // bomCost = 5000 × 6 = 30000
    expect(cost).toBe(30000);
  });

  it("toleransi error query komponen → kontribusi 0 (tidak gagal)", async () => {
    mockBarangKomponen([
      {
        id: "bk-1",
        parent_barang_id: "b-x",
        komponen_id: "b-kaki",
        qty: 1,
        is_deleted: 0,
      },
    ]);
    mockQueryOne.mockRejectedValue(new Error("conn down"));
    const cost = await computeBomCostPerUnit("b-x", null);
    // Kegagalan lookup AVCO ditoleransi → kontribusi komponen 0.
    expect(cost).toBe(0);
  });
});
