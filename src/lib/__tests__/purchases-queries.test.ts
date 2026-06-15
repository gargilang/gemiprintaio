/**
 * purchases-queries enrichment: batch lookup, no N+1.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

jest.mock("@/lib/server-data-supabase", () => ({
  __esModule: true,
  fetchLastNomorPembelian: jest.fn(),
  fetchLastNomorPembelianMaklon: jest.fn(),
}));
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: jest.fn(),
}));
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  convertRollVariant: jest.fn(),
  findOrCreateRollVariant: jest.fn(),
  getInventoryMovements: jest.fn(),
  postInventoryMovement: jest.fn(),
}));

import { enrichPurchaseRows, getDebts } from "../services/purchases-queries";

beforeEach(() => resetMockDb());

describe("enrichPurchaseRows (no N+1)", () => {
  it("attaches vendor, creator, and item names in batch", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT V", alamat: "Jl" });
    mockTable("profil").set("u1", { id: "u1", nama_lengkap: "Budi" });
    mockTable("barang").set("b1", { id: "b1", nama: "Tinta" });
    mockTable("item_pembelian").set("ip1", {
      id: "ip1", pembelian_id: "p1", barang_id: "b1", jumlah: 2, harga_satuan: 1000, subtotal: 2000,
    });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const rows = [{ id: "p1", vendor_id: "v1", dibuat_oleh: "u1", total_jumlah: 2000 }];
    const result = await enrichPurchaseRows(rows);

    expect(result[0]!.vendor_name).toBe("PT V");
    expect(result[0]!.created_by_name).toBe("Budi");
    expect(result[0]!.items![0]!.nama_barang).toBe("Tinta");
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});

describe("getDebts (no N+1)", () => {
  it("attaches vendor_name in batch and filters by status", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT V" });
    mockTable("pembelian").set("p1", {
      id: "p1", vendor_id: "v1", tanggal: "2026-05-01",
      total_jumlah: 5000, jumlah_dibayar: 1000, status_pembayaran: "SEBAGIAN",
    });
    mockTable("pembelian").set("p2", {
      id: "p2", vendor_id: "v1", tanggal: "2026-05-02",
      total_jumlah: 1000, jumlah_dibayar: 1000, status_pembayaran: "LUNAS",
    });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const debts = await getDebts();
    expect(debts).toHaveLength(1);
    expect(debts[0].vendor_name).toBe("PT V");
    expect(debts[0].sisa_hutang).toBe(4000);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
