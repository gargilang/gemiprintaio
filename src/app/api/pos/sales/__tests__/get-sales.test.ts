import { GET } from "../route";

jest.mock("@/lib/auth-guard-server", () => ({
  __esModule: true,
  requireSession: jest.fn().mockResolvedValue({ uid: "u1", role: "MANAGER" }),
  AuthGuardError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/pos-service", () => ({
  __esModule: true,
  getSales: jest.fn().mockResolvedValue([
    {
      id: "s1",
      nomor_faktur: "INV-001",
      pelanggan_nama: "Budi",
      total_jumlah: 150000,
      metode_pembayaran: "CASH",
      status_transaksi: "LUNAS",
      dibuat_pada: "2026-06-01T10:00:00Z",
    },
  ]),
}));

describe("GET /api/pos/sales", () => {
  it("returns sales list", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sales).toBeDefined();
    expect(body.sales.length).toBe(1);
    expect(body.sales[0].nomor_faktur).toBe("INV-001");
  });
});
