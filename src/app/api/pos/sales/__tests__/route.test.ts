import { makeRequest } from "@/lib/__tests__/helpers/next-request";

const requireGuard = jest.fn();
jest.mock("@/lib/auth-guard-server", () => {
  class AuthGuardError extends Error {
    status: number;
    constructor(m: string, s: number) {
      super(m);
      this.name = "AuthGuardError";
      this.status = s;
    }
  }
  return {
    AuthGuardError,
    requireSession: () => requireGuard(),
    requireAdminOrManager: () => requireGuard(),
    requireProductionInventoryRole: () => requireGuard(),
  };
});
jest.mock("@/lib/services/pos-service", () => ({
  createSale: jest.fn(),
}));

import { POST } from "../route";
import { createSale } from "@/lib/services/pos-service";

function validBody() {
  return {
    pelanggan_id: "p1",
    metode_pembayaran: "CASH",
    total_jumlah: 1000,
    jumlah_dibayar: 1000,
    jumlah_kembalian: 0,
    items: [
      {
        barang_id: "b1",
        jumlah: 1,
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 1000,
        subtotal: 1000,
      },
    ],
  };
}

describe("POST /api/pos/sales", () => {
  beforeEach(() => jest.clearAllMocks());

  test("tanpa sesi → 401 (guard)", async () => {
    const { AuthGuardError } = jest.requireMock("@/lib/auth-guard-server");
    requireGuard.mockRejectedValue(new AuthGuardError("Unauthorized", 401));
    const res = await POST(
      makeRequest("/api/pos/sales", { method: "POST", body: validBody() })
    );
    expect(res.status).toBe(401);
    expect(createSale).not.toHaveBeenCalled();
  });

  test("payload tidak valid (items kosong) → 422", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    const res = await POST(
      makeRequest("/api/pos/sales", {
        method: "POST",
        body: { ...validBody(), items: [] },
      })
    );
    expect(res.status).toBe(422);
    expect(createSale).not.toHaveBeenCalled();
  });

  test("payload valid → penjualan dibuat", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    (createSale as jest.Mock).mockResolvedValue({
      id: "sale-1",
      nomor_faktur: "INV-260605-001",
      spk_number: "SPK-0001",
    });
    const res = await POST(
      makeRequest("/api/pos/sales", { method: "POST", body: validBody() })
    );
    expect([200, 201]).toContain(res.status);
    expect(createSale).toHaveBeenCalled();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sale.id).toBe("sale-1");
  });
});
