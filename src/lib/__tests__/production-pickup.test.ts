jest.mock("@/lib/db-unified", () => ({
  db: {
    query: jest.fn(),
    queryOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn(),
  },
}));

import { db } from "@/lib/db-unified";
import {
  setOrderStatusSiapDiambilCascade,
  markOrderSudahDiambil,
} from "@/lib/services/production-service";

const mockDb = db as jest.Mocked<typeof db>;

describe("production pickup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.update.mockResolvedValue({ data: null, error: null });
    mockDb.queryOne.mockResolvedValue({
      data: {
        id: "ord-1",
        status: "SIAP_AMBIL",
        status_override_manual: 1,
        penjualan_id: "sale-1",
      },
      error: null,
    });
    mockDb.query.mockResolvedValue({ data: [], error: null });
  });

  it("setOrderStatusSiapDiambilCascade men-set order SIAP_AMBIL", async () => {
    mockDb.query.mockResolvedValue({
      data: [
        {
          id: "item-1",
          order_produksi_id: "ord-1",
          status: "PRINTING",
          is_maklon: 0,
          barang_nama: "Banner",
          roll_inventory_status: "NOT_REQUIRED",
        },
      ],
      error: null,
    });
    mockDb.queryOne
      .mockResolvedValueOnce({
        data: { id: "ord-1", status: "PROSES", penjualan_id: "sale-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "item-1", status: "PRINTING", roll_inventory_status: "NOT_REQUIRED" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "ord-1", status: "SIAP_AMBIL" },
        error: null,
      });

    const hasil = await setOrderStatusSiapDiambilCascade("ord-1");
    expect(hasil.terhalang).toHaveLength(0);
    expect(mockDb.update).toHaveBeenCalledWith(
      "order_produksi",
      "ord-1",
      expect.objectContaining({ status: "SIAP_AMBIL", status_override_manual: 1 }),
    );
  });

  it("setOrderStatusSiapDiambilCascade tidak set SIAP_AMBIL bila ada item terhalang", async () => {
    mockDb.query.mockResolvedValue({
      data: [
        {
          id: "item-1",
          order_produksi_id: "ord-1",
          status: "PRINTING",
          is_maklon: 0,
          barang_nama: "Banner",
          roll_inventory_status: "NOT_REQUIRED",
        },
      ],
      error: null,
    });
    mockDb.queryOne
      .mockResolvedValueOnce({
        data: { id: "ord-1", status: "PROSES", penjualan_id: "sale-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "item-1", status: "PRINTING", roll_inventory_status: "NOT_REQUIRED" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "ord-1", status: "PROSES" },
        error: null,
      });
    mockDb.update.mockImplementation(async (table: string) => {
      if (table === "item_produksi") {
        throw new Error("Gagal update item");
      }
      return { data: null, error: null };
    });

    const hasil = await setOrderStatusSiapDiambilCascade("ord-1");
    expect(hasil.terhalang).toHaveLength(1);
    expect(
      mockDb.update.mock.calls.some(
        (call) =>
          call[0] === "order_produksi" &&
          call[2]?.status === "SIAP_AMBIL",
      ),
    ).toBe(false);
  });

  it("markOrderSudahDiambil menolak order bukan SIAP_AMBIL", async () => {
    mockDb.queryOne.mockResolvedValue({
      data: { id: "ord-1", status: "PROSES" },
      error: null,
    });
    await expect(markOrderSudahDiambil("ord-1")).rejects.toThrow(/belum siap diambil/i);
  });
});
