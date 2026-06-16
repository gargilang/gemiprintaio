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
      makeRequest("/api/pos/sales", { method: "POST", body: validBody() }),
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
      }),
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
      makeRequest("/api/pos/sales", { method: "POST", body: validBody() }),
    );
    expect([200, 201]).toContain(res.status);
    expect(createSale).toHaveBeenCalled();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.sale.id).toBe("sale-1");
  });

  test("meneruskan field header & item lengkap ke createSale", async () => {
    requireGuard.mockResolvedValue({ uid: "u1", role: "admin" });
    (createSale as jest.Mock).mockResolvedValue({
      id: "sale-2",
      nomor_faktur: "INV-260616-002",
      spk_number: "SPK-0002",
    });
    const body = {
      ...validBody(),
      pelanggan_nama_snapshot: "PT Maju Bersama",
      pelanggan_kota: "Jakarta Selatan",
      biaya_tambahan: [{ label: "Ongkir", nominal: 15000 }],
      items: [
        {
          barang_id: "b1",
          jumlah: 3.6,
          nama_satuan: "m²",
          faktor_konversi: 1,
          harga_satuan: 25000,
          subtotal: 90000,
          panjang: 1.2,
          lebar: 2.7,
          billed_panjang: 1.2,
          billed_lebar: 3,
          selectedRollSize: 3,
          finishing: [{ jenis_finishing: "Laminasi Doff" }],
        },
        {
          barang_id: "barang-jasa-maklon",
          jumlah: 1,
          nama_satuan: "pcs",
          faktor_konversi: 1,
          harga_satuan: 12000,
          subtotal: 12000,
          tipe_item: "MAKLON",
          vendor_subkontrak_id: "v1",
          biaya_subkontrak: 8000,
          metode_bayar_vendor: "CASH",
          deskripsi_pekerjaan: "Finishing kayu",
        },
      ],
    };
    const res = await POST(
      makeRequest("/api/pos/sales", { method: "POST", body }),
    );
    expect([200, 201]).toContain(res.status);
    const arg = (createSale as jest.Mock).mock.calls[0][0];
    expect(arg.pelanggan_nama_snapshot).toBe("PT Maju Bersama");
    expect(arg.pelanggan_kota).toBe("Jakarta Selatan");
    expect(arg.biaya_tambahan).toEqual([{ label: "Ongkir", nominal: 15000 }]);
    expect(arg.items[0].finishing).toEqual([
      { jenis_finishing: "Laminasi Doff" },
    ]);
    expect(arg.items[0].selectedRollSize).toBe(3);
    expect(arg.items[0].billed_panjang).toBe(1.2);
    expect(arg.items[0].billed_lebar).toBe(3);
    expect(arg.items[1].tipe_item).toBe("MAKLON");
    expect(arg.items[1].vendor_subkontrak_id).toBe("v1");
    expect(arg.items[1].biaya_subkontrak).toBe(8000);
    expect(arg.items[1].metode_bayar_vendor).toBe("CASH");
    expect(arg.items[1].deskripsi_pekerjaan).toBe("Finishing kayu");
  });
});
