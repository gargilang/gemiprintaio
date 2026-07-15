/**
 * Test guard SELESAI: item induk rakitan tidak boleh diselesaikan
 * sebelum semua komponen berdimensi (baris anak) dikonfirmasi roll-nya (Task 6).
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
jest.mock("@/lib/services/inventory-service", () => ({
  __esModule: true,
  postInventoryMovement: (...args: any[]) => postInventoryMovementMock(...args),
  getRollVariants: jest.fn(async () => []),
}));

jest.mock("@/lib/services/bom-service", () => ({
  resolveBomForUnitPrice: jest.fn(async () => []),
}));

jest.mock("@/lib/services/shop-settings-service", () => ({
  __esModule: true,
  getShopSettings: jest.fn(async () => ({})),
}));

import { updateProductionItemStatus } from "../services/production-service";

beforeEach(() => {
  resetMockDb();
  postInventoryMovementMock.mockReset().mockResolvedValue({});
});

/** Setup: order + item induk + item anak PENDING */
function setupIndukDenganAnakPending() {
  mockTable("order_produksi").set("OP-1", {
    id: "OP-1",
    status: "MENUNGGU",
    nomor_spk: "SPK-0001",
    penjualan_id: "pj-1",
  });

  mockTable("penjualan").set("pj-1", {
    id: "pj-1",
    status_transaksi: "COMPLETED",
  });

  mockTable("item_penjualan").set("ip-1", {
    id: "ip-1",
    barang_id: "kaki-roll",
    jumlah: 1,
    harga_satuan_id: "hp-1",
  });

  // Item induk (Kaki Roll Banner)
  mockTable("item_produksi").set("IP-1", {
    id: "IP-1",
    order_produksi_id: "OP-1",
    item_penjualan_id: "ip-1",
    barang_id: "kaki-roll",
    barang_nama: "Kaki Roll Banner",
    jumlah: 1,
    roll_inventory_status: "NOT_REQUIRED",
    status: "PRINTING",
    parent_item_produksi_id: null,
  });

  // Item anak komponen (Flexi 280, roll belum dikonfirmasi)
  mockTable("item_produksi").set("IP-1-komp-bk-flexi", {
    id: "IP-1-komp-bk-flexi",
    order_produksi_id: "OP-1",
    item_penjualan_id: "ip-1",
    parent_item_produksi_id: "IP-1",
    barang_id: "flexi-280",
    barang_nama: "Flexi 280",
    jumlah: 0.78,
    roll_inventory_status: "PENDING",
    status: "MENUNGGU",
  });
}

/** Setup: order + item induk + item anak POSTED */
function setupIndukDenganAnakPosted() {
  setupIndukDenganAnakPending();
  // Update anak menjadi POSTED
  const anak = mockTable("item_produksi").get("IP-1-komp-bk-flexi");
  mockTable("item_produksi").set("IP-1-komp-bk-flexi", {
    ...anak,
    roll_inventory_status: "POSTED",
    status: "PRINTING",
  });
}

describe("guard SELESAI induk rakitan", () => {
  it("melempar error jika komponen roll masih PENDING saat induk ditandai SELESAI", async () => {
    setupIndukDenganAnakPending();

    await expect(
      updateProductionItemStatus("IP-1", { status: "SELESAI", operator_id: "u1" }),
    ).rejects.toThrow(/roll/i);

    // Status induk TIDAK berubah
    const induk = mockTable("item_produksi").get("IP-1");
    expect(induk.status).toBe("PRINTING");
  });

  it("berhasil SELESAI-kan induk jika semua komponen roll sudah POSTED", async () => {
    setupIndukDenganAnakPosted();

    const result = await updateProductionItemStatus("IP-1", {
      status: "SELESAI",
      operator_id: "u1",
    });

    expect(result).toBe(true);
    const induk = mockTable("item_produksi").get("IP-1");
    expect(induk.status).toBe("SELESAI");
  });

  it("tidak memblokir SELESAI jika tidak ada baris anak (barang murni/non-rakitan)", async () => {
    // Hanya induk, tidak ada anak
    mockTable("order_produksi").set("OP-2", {
      id: "OP-2",
      status: "MENUNGGU",
      nomor_spk: "SPK-0002",
      penjualan_id: "pj-2",
    });
    mockTable("penjualan").set("pj-2", {
      id: "pj-2",
      status_transaksi: "COMPLETED",
    });
    mockTable("item_penjualan").set("ip-2", {
      id: "ip-2",
      barang_id: "barang-biasa",
      jumlah: 1,
      harga_satuan_id: "hp-2",
    });
    mockTable("item_produksi").set("IP-2", {
      id: "IP-2",
      order_produksi_id: "OP-2",
      item_penjualan_id: "ip-2",
      barang_id: "barang-biasa",
      barang_nama: "Barang Biasa",
      jumlah: 1,
      roll_inventory_status: "NOT_REQUIRED",
      status: "PRINTING",
      parent_item_produksi_id: null,
    });

    const result = await updateProductionItemStatus("IP-2", {
      status: "SELESAI",
      operator_id: "u1",
    });

    expect(result).toBe(true);
    const item = mockTable("item_produksi").get("IP-2");
    expect(item.status).toBe("SELESAI");
  });
});
