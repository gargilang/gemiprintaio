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
    requireNotDemo: (s?: unknown) => s ?? requireGuard(),
  };
});
jest.mock("@/lib/services/sync-operations-service", () => ({
  startAutoSync: jest.fn(),
  stopAutoSync: jest.fn(),
  getSyncStatus: jest.fn(),
}));

import { POST } from "../route";
import { startAutoSync } from "@/lib/services/sync-operations-service";

describe("POST /api/sync/auto", () => {
  beforeEach(() => jest.clearAllMocks());

  test("tanpa sesi → 401 (guard)", async () => {
    const { AuthGuardError } = jest.requireMock("@/lib/auth-guard-server");
    requireGuard.mockRejectedValue(new AuthGuardError("Unauthorized", 401));
    const res = await POST(
      makeRequest("/api/sync/auto", { method: "POST", body: { action: "start" } })
    );
    expect(res.status).toBe(401);
    expect(startAutoSync).not.toHaveBeenCalled();
  });

  test("action start → 200 + startAutoSync dipanggil", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    const res = await POST(
      makeRequest("/api/sync/auto", {
        method: "POST",
        body: { action: "start", intervalMinutes: 15 },
      })
    );
    expect(res.status).toBe(200);
    expect(startAutoSync).toHaveBeenCalledWith(15);
  });

  test("action tidak dikenal → 400", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    const res = await POST(
      makeRequest("/api/sync/auto", {
        method: "POST",
        body: { action: "bogus" },
      })
    );
    expect(res.status).toBe(400);
  });
});
