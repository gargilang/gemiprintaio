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

jest.mock("@/lib/services/pengambilan-service", () => ({
  listPengambilanBelumDiambil: jest.fn(async () => [
    {
      order_id: "op-1",
      nomor_spk: "SPK-001",
      nomor_faktur: "INV-001",
      pelanggan_nama: "Pelanggan Umum",
      item_ringkas: "Banner",
      jumlah_item: 1,
      total_jumlah: 100000,
      jumlah_dibayar: 50000,
      sisa_piutang: 50000,
      status_bayar: "SEBAGIAN",
      piutang_id: "piu-1",
      penjualan_id: "sale-1",
    },
  ]),
  listPengambilanSudahDiambil: jest.fn(async () => []),
}));

jest.mock("@/lib/pg-error", () => ({
  friendlyPgError: jest.fn((e: any) => e?.message || "Gagal memuat pengambilan"),
}));

import { GET } from "../route";
import {
  listPengambilanBelumDiambil,
  listPengambilanSudahDiambil,
} from "@/lib/services/pengambilan-service";

describe("GET /api/produksi/pengambilan", () => {
  it("mengembalikan list belum diambil secara bawaan", async () => {
    const res = await GET(
      new Request("http://localhost/api/produksi/pengambilan"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.rows).toHaveLength(1);
    expect(listPengambilanBelumDiambil).toHaveBeenCalledWith();
  });

  it("menolak status tidak dikenal", async () => {
    const res = await GET(
      new Request("http://localhost/api/produksi/pengambilan?status=invalid"),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Status tidak valid");
  });

  it("mengembalikan list sudah diambil saat status=sudah", async () => {
    const res = await GET(
      new Request("http://localhost/api/produksi/pengambilan?status=sudah"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.rows).toEqual([]);
    expect(listPengambilanSudahDiambil).toHaveBeenCalledWith(100);
  });
});
