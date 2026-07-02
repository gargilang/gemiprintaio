// @jest-environment node
import { GET, POST, DELETE } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth-guard-server", () => ({
  requireAdminOrManager: jest.fn().mockResolvedValue({ uid: "test-user" }),
  requireSession: jest.fn().mockResolvedValue({ uid: "test-user" }),
}));

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: jest.fn().mockResolvedValue({ data: [], error: null }),
    queryOne: jest.fn().mockResolvedValue({
      data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
      error: null,
    }),
    insert: jest.fn().mockResolvedValue({ data: { id: "new-id" }, error: null }),
    update: jest.fn().mockResolvedValue({ data: null, error: null }),
    generateId: jest.fn().mockReturnValue("test-id"),
  },
  generateId: jest.fn().mockReturnValue("test-id"),
  getCurrentTimestamp: jest.fn().mockReturnValue("2026-01-01T00:00:00Z"),
}));

describe("GET /api/barang-komponen", () => {
  it("mengembalikan 400 jika parent_barang_id tidak ada", async () => {
    const req = new NextRequest("http://localhost/api/barang-komponen");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/barang-komponen", () => {
  it("mengembalikan 422 jika qty tidak valid", async () => {
    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({ parent_barang_id: "p1", komponen_id: "k1", qty: -1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("mengembalikan 422 jika komponen_id sama dengan parent_barang_id", async () => {
    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({ parent_barang_id: "same", komponen_id: "same", qty: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });
});
