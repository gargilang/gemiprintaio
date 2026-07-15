/**
 * getProductionOrderById: nested enrichment batched, no per-item N+1.
 * Termasuk grouping baris anak komponen rakitan di bawah induk.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  getRollVariants: jest.fn(),
  postInventoryMovement: jest.fn(),
}));
jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(),
}));

import { getProductionOrderById } from "../services/production-service";

beforeEach(() => resetMockDb());

describe("getProductionOrderById (no per-item N+1)", () => {
  it("enriches items with finishing, operator, saleItem, and consumption in batch", async () => {
    mockTable("order_produksi").set("op1", { id: "op1", penjualan_id: "s1" });
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1", pelanggan_id: "c1" });
    mockTable("pelanggan").set("c1", { id: "c1", nama: "Andi" });
    mockTable("profil").set("u1", { id: "u1", nama_pengguna: "operator1" });
    mockTable("item_produksi").set("ip1", {
      id: "ip1", order_produksi_id: "op1", item_penjualan_id: "si1",
      operator_id: "u1", dibuat_pada: "2026-05-25",
      parent_item_produksi_id: null,
    });
    mockTable("item_penjualan").set("si1", { id: "si1", tipe_item: "MAKLON", barang_id: "b1" });
    mockTable("item_finishing").set("if1", {
      id: "if1", item_produksi_id: "ip1", operator_id: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("production_material_consumptions").set("pmc1", {
      id: "pmc1", item_produksi_id: "ip1", status: "POSTED",
    });

    const order = await getProductionOrderById("op1");
    expect(order).not.toBeNull();
    expect(order!.nomor_faktur).toBe("INV-1");
    const item = order!.items![0]!;
    expect(item.operator_nama).toBe("operator1");
    expect(item.is_maklon).toBe(true);
    expect(item.finishing![0]!.operator_nama).toBe("operator1");
    expect(item.consumption?.id).toBe("pmc1");
    // header (order+penjualan+pelanggan) uses 3 queryOne; items use batch queries.
    expect(__mock.db.queryOne.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("baris komponen rakitan dikelompokkan di bawah induk, tidak top-level", async () => {
    mockTable("order_produksi").set("OP-1", { id: "OP-1", penjualan_id: "s1" });
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1", pelanggan_id: "c1" });
    mockTable("pelanggan").set("c1", { id: "c1", nama: "Walk-in" });
    mockTable("item_penjualan").set("ip-induk", {
      id: "ip-induk",
      barang_id: "kaki-roll",
      tipe_item: "BARANG",
    });

    // Item induk
    mockTable("item_produksi").set("IP-1", {
      id: "IP-1",
      order_produksi_id: "OP-1",
      item_penjualan_id: "ip-induk",
      barang_id: "kaki-roll",
      barang_nama: "Kaki Roll Banner",
      parent_item_produksi_id: null,
      roll_inventory_status: "NOT_REQUIRED",
      status: "MENUNGGU",
    });

    // Item anak komponen (Flexi 280)
    mockTable("item_produksi").set("IP-1-komp-bk-flexi", {
      id: "IP-1-komp-bk-flexi",
      order_produksi_id: "OP-1",
      item_penjualan_id: "ip-induk",
      parent_item_produksi_id: "IP-1",
      barang_id: "flexi-280",
      barang_nama: "Flexi 280",
      panjang: 1.3,
      lebar: 0.6,
      jumlah: 0.78,
      recommended_roll_width_m: 0.914,
      roll_inventory_status: "PENDING",
      status: "MENUNGGU",
    });

    const order = await getProductionOrderById("OP-1");
    expect(order).not.toBeNull();

    // items top-level hanya berisi induk
    expect(order!.items).toHaveLength(1);
    expect(order!.items![0].id).toBe("IP-1");

    // Anak dikelompokkan sebagai komponen_roll di bawah induk
    const kompRoll = (order!.items![0] as any).komponen_roll;
    expect(kompRoll).toHaveLength(1);
    expect(kompRoll[0].barang_id).toBe("flexi-280");
    expect(kompRoll[0].roll_inventory_status).toBe("PENDING");
  });
});
