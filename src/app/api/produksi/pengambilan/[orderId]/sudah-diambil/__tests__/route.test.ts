jest.mock("@/lib/auth-guard-server", () => ({
  requireOperationalRole: jest.fn(async () => ({ uid: "user-1" })),
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/production-service", () => ({
  markOrderSudahDiambil: jest.fn(async () => ({
    selesai: ["item-1"],
    terhalang: [],
    statusOrderAkhir: "SELESAI",
  })),
}));

jest.mock("@/lib/pg-error", () => ({
  friendlyPgError: jest.fn((e: any) => e?.message || "Gagal menandai SPK sudah diambil"),
}));

import { POST } from "../route";
import { markOrderSudahDiambil } from "@/lib/services/production-service";

describe("POST /api/produksi/pengambilan/:orderId/sudah-diambil", () => {
  it("menandai order sudah diambil", async () => {
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ orderId: "op-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result.statusOrderAkhir).toBe("SELESAI");
    expect(markOrderSudahDiambil).toHaveBeenCalledWith("op-1");
  });
});
