// @jest-environment node
// Top-level mock instances supaya bisa di-reset per test via
// mockResolvedValueOnce + beforeEach(jest.clearAllMocks).
// Nama wajib diawali "mock" agar bisa direferensikan dari factory jest.mock
// yang di-hoist oleh ts-jest. Deklarasi harus di atas import supaya sudah
// ter-init saat factory dipanggil oleh import pertama.
const mockDbQuery = jest.fn();
const mockDbQueryOne = jest.fn();
const mockDbInsert = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbGenerateId = jest.fn().mockReturnValue("test-id");

import { GET, POST, DELETE } from "../route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth-guard-server", () => ({
  requireAdminOrManager: jest.fn().mockResolvedValue({ uid: "test-user" }),
  requireSession: jest.fn().mockResolvedValue({ uid: "test-user" }),
}));

jest.mock("@/lib/db-unified", () => ({
  db: {
    query: mockDbQuery,
    queryOne: mockDbQueryOne,
    insert: mockDbInsert,
    update: mockDbUpdate,
    generateId: mockDbGenerateId,
  },
  generateId: mockDbGenerateId,
  getCurrentTimestamp: jest.fn().mockReturnValue("2026-01-01T00:00:00Z"),
}));

beforeEach(() => {
  jest.clearAllMocks();
  // Default implementations setiap test.
  mockDbQuery.mockResolvedValue({ data: [], error: null });
  mockDbQueryOne.mockResolvedValue({
    data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
    error: null,
  });
  mockDbInsert.mockResolvedValue({ data: { id: "new-id" }, error: null });
  mockDbUpdate.mockResolvedValue({ data: null, error: null });
});

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
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "k1",
        qty: -1,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("mengembalikan 422 jika komponen_id sama dengan parent_barang_id", async () => {
    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "same",
        komponen_id: "same",
        qty: 1,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });
});

describe("POST /api/barang-komponen — unit_price_id (B2)", () => {
  it("menerima unit_price_id valid (milik parent barang) → 201", async () => {
    mockDbQueryOne.mockResolvedValueOnce({
      data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
      error: null,
    } as any);
    mockDbQueryOne.mockResolvedValueOnce({
      data: { id: "up-1", barang_id: "p1" },
      error: null,
    } as any);
    mockDbInsert.mockResolvedValueOnce({ data: { id: "new-id" }, error: null });

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "k1",
        qty: 2,
        unit_price_id: "up-1",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockDbInsert).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({ unit_price_id: "up-1" }),
    );
  });

  it("menolak unit_price_id yang tidak milik parent_barang_id → 422", async () => {
    mockDbQueryOne.mockResolvedValueOnce({
      data: { id: "k1", butuh_dimensi_status: 0, satuan_dasar: "pcs" },
      error: null,
    } as any);
    mockDbQueryOne.mockResolvedValueOnce({
      data: { id: "up-2", barang_id: "p-other" },
      error: null,
    } as any);

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "k1",
        qty: 2,
        unit_price_id: "up-2",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/tidak milik barang/i);
  });

  it("default jumlah_roll = 1 untuk komponen berdimensi tanpa jumlah_roll (B3)", async () => {
    mockDbQueryOne.mockResolvedValueOnce({
      data: { id: "kdim", butuh_dimensi_status: 1, satuan_dasar: "m²" },
      error: null,
    } as any);
    mockDbInsert.mockResolvedValueOnce({ data: { id: "new-id" }, error: null });

    const req = new NextRequest("http://localhost/api/barang-komponen", {
      method: "POST",
      body: JSON.stringify({
        parent_barang_id: "p1",
        komponen_id: "kdim",
        qty: 0.85,
        lebar: 0.5,
        panjang: 1.7,
        // jumlah_roll sengaja tidak di-supply → default 1
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockDbInsert).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({ jumlah_roll: 1, lebar: 0.5, panjang: 1.7 }),
    );
  });
});

describe("GET /api/barang-komponen — filter unit_price_id (B2)", () => {
  it("mengirim query unit_price_id ke db.query", async () => {
    mockDbQuery.mockResolvedValueOnce({ data: [], error: null } as any);

    const req = new NextRequest(
      "http://localhost/api/barang-komponen?parent_barang_id=p1&unit_price_id=up-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mockDbQuery).toHaveBeenCalledWith(
      "barang_komponen",
      expect.objectContaining({
        where: expect.objectContaining({
          parent_barang_id: "p1",
          unit_price_id: "up-1",
        }),
      }),
    );
  });
});
