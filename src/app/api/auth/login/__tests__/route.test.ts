import { makeRequest } from "@/lib/__tests__/helpers/next-request";

jest.mock("@/lib/services/auth-service", () => ({
  login: jest.fn(),
}));
jest.mock("@/lib/session", () => ({
  createSessionWithUser: jest.fn().mockResolvedValue("jwt"),
}));
jest.mock("@/lib/rate-limit", () => ({
  loginLimiter: null,
  limitOrPass: jest.fn().mockResolvedValue({ ok: true }),
}));

import { POST } from "../route";
import { login } from "@/lib/services/auth-service";

describe("POST /api/auth/login", () => {
  beforeEach(() => jest.clearAllMocks());

  test("kredensial valid → 200 + success", async () => {
    (login as jest.Mock).mockResolvedValue({
      success: true,
      user: { id: "u1", role: "admin", nama_pengguna: "admin" },
    });
    const res = await POST(
      makeRequest("/api/auth/login", {
        method: "POST",
        body: { username: "admin", password: "secret" },
      })
    );
    expect(res.status).toBe(200);
  });

  test("kredensial salah → 401 (pesan generik dari Fase 1)", async () => {
    (login as jest.Mock).mockResolvedValue({
      success: false,
      error: "Kredensial salah",
    });
    const res = await POST(
      makeRequest("/api/auth/login", {
        method: "POST",
        body: { username: "x", password: "y" },
      })
    );
    expect(res.status).toBe(401);
  });

  test("akun tidak aktif → 403", async () => {
    (login as jest.Mock).mockResolvedValue({
      success: false,
      error: "Akun tidak aktif. Hubungi administrator.",
    });
    const res = await POST(
      makeRequest("/api/auth/login", {
        method: "POST",
        body: { username: "x", password: "y" },
      })
    );
    expect(res.status).toBe(403);
  });
});
