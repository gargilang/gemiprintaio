/**
 * Quotation service tests.
 *
 * Covers the create / update / status transitions and convertQuotationToSale
 * happy paths, plus the invariant that a quotation must not change stock or
 * finance state until convert is called.
 */

import { __mock, resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

const createSaleMock = jest.fn();
jest.mock("@/lib/services/pos-service", () => ({
  __esModule: true,
  createSale: (...args: any[]) => createSaleMock(...args),
}));

import {
  convertQuotationToSale,
  createQuotation,
  updateQuotation,
  updateQuotationStatus,
} from "../services/quotation-service";

const baseInput = {
  pelanggan_id: null,
  pelanggan_nama_snapshot: "Walk-in",
  pelanggan_kota: null,
  status: "DRAFT" as const,
  catatan: "Catatan",
  items: [
    {
      barang_id: "barang-1",
      jumlah: 5,
      nama_satuan: "lembar",
      faktor_konversi: 1,
      harga_satuan: 1000,
      tipe_item: "BARANG" as const,
    },
  ],
};

describe("quotation-service", () => {
  beforeEach(() => {
    resetMockDb();
    createSaleMock.mockReset();
  });

  it("membuat penawaran dengan total benar dan status DRAF", async () => {
    const result = await createQuotation({ ...baseInput, tanggal: "2026-05-25" });
    expect(result.nomor_penawaran).toBe("QUO-20260525-001");

    const headers = Array.from(mockTable("penawaran").values());
    const items = Array.from(mockTable("item_penawaran").values());
    expect(headers).toHaveLength(1);
    expect(headers[0].status).toBe("DRAFT");
    expect(headers[0].total_jumlah).toBe(5000);
    expect(items).toHaveLength(1);
    expect(items[0].subtotal).toBe(5000);
  });

  it("tidak menyentuh barang/keuangan/inventory saat create atau update", async () => {
    await createQuotation({ ...baseInput, tanggal: "2026-05-25" });
    await updateQuotation(
      Array.from(mockTable("penawaran").values())[0].id,
      { ...baseInput, items: [{ ...baseInput.items[0], jumlah: 10 }] }
    );
    expect(mockTable("barang").size).toBe(0);
    expect(mockTable("keuangan").size).toBe(0);
    expect(mockTable("inventory_movements").size).toBe(0);
    expect(__mock.db.update).not.toHaveBeenCalledWith("barang", expect.anything(), expect.anything());
  });

  it("memblokir edit penawaran yang sudah dikonversi", async () => {
    await createQuotation({ ...baseInput, tanggal: "2026-05-25" });
    const id = Array.from(mockTable("penawaran").values())[0].id;
    await updateQuotationStatus(id, "CONVERTED");
    await expect(
      updateQuotation(id, baseInput)
    ).rejects.toThrow("sudah dikonversi");
  });

  it("mengkonversi penawaran ke penjualan dan menautkan faktur baru", async () => {
    createSaleMock.mockImplementation(async (input) => ({ id: "sale-99", ...input }));

    await createQuotation({ ...baseInput, tanggal: "2026-05-25" });
    const quote = Array.from(mockTable("penawaran").values())[0];
    // Seed a placeholder invoice row so update("penjualan", "sale-99", …)
    // operates on something. The pos-service mock is the source of truth
    // for sale creation so we manually insert a stub.
    mockTable("penjualan").set("sale-99", { id: "sale-99", penawaran_id: null });

    const sale = await convertQuotationToSale(quote.id, {
      metode_pembayaran: "CASH",
      jumlah_dibayar: 5000,
      jumlah_kembalian: 0,
    });

    expect(sale.id).toBe("sale-99");
    expect(createSaleMock).toHaveBeenCalledTimes(1);
    expect(createSaleMock.mock.calls[0][0]).toMatchObject({
      total_jumlah: 5000,
      metode_pembayaran: "CASH",
    });

    const updated = mockTable("penawaran").get(quote.id)!;
    expect(updated.status).toBe("CONVERTED");
    expect(updated.converted_penjualan_id).toBe("sale-99");

    const invoice = mockTable("penjualan").get("sale-99")!;
    expect(invoice.penawaran_id).toBe(quote.id);
  });

  it("menolak konversi penawaran CANCELLED atau EXPIRED", async () => {
    await createQuotation({ ...baseInput, tanggal: "2026-05-25" });
    const id = Array.from(mockTable("penawaran").values())[0].id;
    await updateQuotationStatus(id, "CANCELLED");
    await expect(
      convertQuotationToSale(id, {
        metode_pembayaran: "CASH",
        jumlah_dibayar: 0,
        jumlah_kembalian: 0,
      })
    ).rejects.toThrow("sudah batal");
  });
});
