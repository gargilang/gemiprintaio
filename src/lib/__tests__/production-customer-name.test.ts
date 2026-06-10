import { updateSaleCustomer } from "@/lib/services/production-service";

const updateMock = jest.fn();

jest.mock("@/lib/db-unified", () => ({
  db: {
    update: (...args: any[]) => updateMock(...args),
  },
  generateId: () => "id-test",
  getCurrentTimestamp: () => "2026-06-10T00:00:00.000Z",
}));

describe("updateSaleCustomer", () => {
  beforeEach(() => updateMock.mockReset().mockResolvedValue({ error: null }));

  it("nama bebas -> snapshot, pelanggan_id null", async () => {
    await updateSaleCustomer("jual-1", { pelanggan_nama_snapshot: "Pak Budi" });
    expect(updateMock).toHaveBeenCalledWith("penjualan", "jual-1", {
      pelanggan_id: null,
      pelanggan_nama_snapshot: "Pak Budi",
    });
  });

  it("pilih terdaftar -> pelanggan_id, snapshot null", async () => {
    await updateSaleCustomer("jual-1", { pelanggan_id: "plg-9" });
    expect(updateMock).toHaveBeenCalledWith("penjualan", "jual-1", {
      pelanggan_id: "plg-9",
      pelanggan_nama_snapshot: null,
    });
  });
});
