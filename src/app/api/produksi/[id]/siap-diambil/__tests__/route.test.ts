jest.mock("@/lib/auth-guard-server", () => ({
  requireProductionInventoryRole: jest.fn(async () => ({ uid: "user-1" })),
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 403) {
      super(message);
      this.status = status;
    }
  },
}));

jest.mock("@/lib/services/production-service", () => ({
  setOrderStatusSiapDiambilCascade: jest.fn(async () => ({
    selesai: ["item-1"],
    terhalang: [],
    statusOrderAkhir: "SIAP_AMBIL",
  })),
}));

jest.mock("@/lib/pg-error", () => ({
  friendlyPgError: jest.fn((e: any) => e?.message || "Gagal menandai SPK siap diambil"),
}));

import { POST } from "../route";
import { setOrderStatusSiapDiambilCascade } from "@/lib/services/production-service";

describe("POST /api/produksi/:id/siap-diambil", () => {
  it("menjalankan cascade Siap Diambil", async () => {
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "op-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result.statusOrderAkhir).toBe("SIAP_AMBIL");
    expect(setOrderStatusSiapDiambilCascade).toHaveBeenCalledWith("op-1");
  });
});
