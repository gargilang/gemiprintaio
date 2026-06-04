/**
 * Purchase Order service tests.
 *
 * Coverage:
 *   - createPurchaseOrder produces correct totals + DRAFT status
 *   - receivePurchaseOrder partial → PARTIAL_RECEIVED, full → RECEIVED
 *   - qty > sisa is rejected
 *   - status transitions block CANCELLED PO
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

const createPurchaseMock = jest.fn();
const payDebtMock = jest.fn();
jest.mock("@/lib/services/purchases-service", () => ({
  __esModule: true,
  createPurchase: (...args: any[]) => createPurchaseMock(...args),
  payDebt: (...args: any[]) => payDebtMock(...args),
}));

import {
  createPurchaseOrder,
  receivePurchaseOrder,
  updatePurchaseOrderStatus,
} from "../services/purchase-order-service";

function seedBarang() {
  mockTable("barang").set("barang-1", { id: "barang-1", nama: "Tinta Hitam" });
  mockTable("vendor").set("vendor-1", {
    id: "vendor-1",
    nama_perusahaan: "PT Vendor",
  });
}

const baseInput = {
  vendor_id: "vendor-1",
  status: "DRAFT" as const,
  items: [
    {
      barang_id: "barang-1",
      jumlah: 10,
      nama_satuan: "kg",
      faktor_konversi: 1,
      harga_satuan: 25000,
    },
  ],
};

describe("purchase-order-service", () => {
  beforeEach(() => {
    resetMockDb();
    createPurchaseMock.mockReset();
    payDebtMock.mockReset().mockResolvedValue({ status: "SEBAGIAN", sisa_hutang: 0 });
    seedBarang();
  });

  it("membuat PO dengan total benar dan status DRAF", async () => {
    const result = await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    expect(result.nomor_po).toBe("PO-20260525-001");
    const po = Array.from(mockTable("purchase_orders").values())[0];
    expect(po.status).toBe("DRAFT");
    expect(po.total_jumlah).toBe(250000);
    const items = Array.from(mockTable("purchase_order_items").values());
    expect(items).toHaveLength(1);
    expect(items[0].qty_received).toBe(0);
  });

  it("penerimaan parsial menyetel PARTIAL_RECEIVED dan menambah qty_received", async () => {
    createPurchaseMock.mockImplementation(async (input) => {
      const id = "purchase-1";
      mockTable("pembelian").set(id, { id, ...input });
      // Mimic the items rows that real createPurchase would have produced.
      for (const [index, item] of input.items.entries()) {
        const itemId = `item-pem-${index}`;
        mockTable("item_pembelian").set(itemId, {
          id: itemId,
          pembelian_id: id,
          ...item,
        });
      }
      return { id };
    });

    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;

    await receivePurchaseOrder({
      purchase_order_id: po.id,
      metode_pembayaran: "NET30",
      items: [{ purchase_order_item_id: itemId, qty: 4 }],
    });

    const refreshed = mockTable("purchase_orders").get(po.id)!;
    expect(refreshed.status).toBe("PARTIAL_RECEIVED");

    const refreshedItem = mockTable("purchase_order_items").get(itemId)!;
    expect(refreshedItem.qty_received).toBe(4);
    expect(createPurchaseMock).toHaveBeenCalledTimes(1);
    // metode_pembayaran forwarded from receive call.
    expect(createPurchaseMock.mock.calls[0][0].metode_pembayaran).toBe("NET30");
  });

  it("penerimaan penuh lewat beberapa panggilan mengubah status jadi RECEIVED", async () => {
    createPurchaseMock.mockImplementation(async () => ({ id: `purchase-${Date.now()}` }));
    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;

    await receivePurchaseOrder({
      purchase_order_id: po.id,
      metode_pembayaran: "CASH",
      items: [{ purchase_order_item_id: itemId, qty: 6 }],
    });
    await receivePurchaseOrder({
      purchase_order_id: po.id,
      metode_pembayaran: "CASH",
      items: [{ purchase_order_item_id: itemId, qty: 4 }],
    });

    const refreshed = mockTable("purchase_orders").get(po.id)!;
    expect(refreshed.status).toBe("RECEIVED");
    expect(mockTable("purchase_order_items").get(itemId)!.qty_received).toBe(10);
  });

  it("menolak qty > sisa pesanan pembelian", async () => {
    createPurchaseMock.mockImplementation(async () => ({ id: `purchase-${Date.now()}` }));
    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;

    await expect(
      receivePurchaseOrder({
        purchase_order_id: po.id,
        metode_pembayaran: "CASH",
        items: [{ purchase_order_item_id: itemId, qty: 11 }],
      })
    ).rejects.toThrow(/melebihi sisa pesanan pembelian/);
  });

  it("menolak penerimaan pada PO yang sudah dibatalkan", async () => {
    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;
    await updatePurchaseOrderStatus(po.id, "CANCELLED");

    await expect(
      receivePurchaseOrder({
        purchase_order_id: po.id,
        metode_pembayaran: "CASH",
        items: [{ purchase_order_item_id: itemId, qty: 1 }],
      })
    ).rejects.toThrow(/dibatalkan/);
  });

  it("meneruskan jumlah_dibayar opsional via payDebt untuk penerimaan berbasis kredit", async () => {
    createPurchaseMock.mockImplementation(async () => ({ id: "p-1" }));
    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;

    await receivePurchaseOrder({
      purchase_order_id: po.id,
      metode_pembayaran: "NET30",
      jumlah_dibayar: 75000,
      items: [{ purchase_order_item_id: itemId, qty: 3 }],
    });

    expect(payDebtMock).toHaveBeenCalledTimes(1);
    expect(payDebtMock.mock.calls[0][0]).toMatchObject({
      purchase_id: "p-1",
      jumlah_bayar: 75000,
    });
  });

  it("tidak memanggil payDebt saat metode CASH (pembelian sudah lunas)", async () => {
    createPurchaseMock.mockImplementation(async () => ({ id: "p-2" }));
    await createPurchaseOrder({ ...baseInput, tanggal: "2026-05-25" });
    const po = Array.from(mockTable("purchase_orders").values())[0];
    const itemId = Array.from(mockTable("purchase_order_items").values())[0].id;

    await receivePurchaseOrder({
      purchase_order_id: po.id,
      metode_pembayaran: "CASH",
      jumlah_dibayar: 50000,
      items: [{ purchase_order_item_id: itemId, qty: 3 }],
    });

    expect(payDebtMock).not.toHaveBeenCalled();
  });
});
