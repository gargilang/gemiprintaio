jest.mock("@/lib/auth-guard-server", () => ({
  AuthGuardError: class AuthGuardError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  },
  requireSession: jest.fn(),
  requireOperationalRole: jest.fn(),
}));

jest.mock("@/lib/services/pending-maklon-service", () => {
  const actual = jest.requireActual("@/lib/services/pending-maklon-service");
  return {
    listPendingMaklon: jest.fn(),
    reconcilePendingMaklonItem: jest.fn(),
    reconcilePendingMaklonInputSchema: actual.reconcilePendingMaklonInputSchema,
  };
});

import { NextRequest } from "next/server";
import { GET } from "../pending/route";
import { POST } from "../pending/[id]/reconcile/route";
import {
  AuthGuardError,
  requireOperationalRole,
  requireSession,
} from "@/lib/auth-guard-server";
import {
  listPendingMaklon,
  reconcilePendingMaklonItem,
} from "@/lib/services/pending-maklon-service";

const mockRequireSession = requireSession as jest.Mock;
const mockRequireOperationalRole = requireOperationalRole as jest.Mock;
const mockListPendingMaklon = listPendingMaklon as jest.Mock;
const mockReconcilePendingMaklonItem = reconcilePendingMaklonItem as jest.Mock;

function jsonReq(body: unknown) {
  return new NextRequest(
    "http://localhost/api/katalog-maklon/pending/it-1/reconcile",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    },
  );
}

describe("/api/katalog-maklon/pending", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireSession.mockResolvedValue({ uid: "u-1" });
    mockRequireOperationalRole.mockResolvedValue({ uid: "u-2" });
  });

  it("returns pending maklon rows for logged-in users", async () => {
    mockListPendingMaklon.mockResolvedValue([
      {
        id: "it-1",
        penjualan_id: "sale-1",
        tipe_item: "MAKLON",
        katalog_maklon_id: "km-1",
        deskripsi_pekerjaan: "Banner",
        jumlah: 2,
        harga_satuan: 50000,
        subtotal: 100000,
        pending_vendor_hpp: 1,
        nomor_faktur: "INV-1",
        tanggal: "2026-07-12",
        pelanggan_nama: "Pelanggan Umum",
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].id).toBe("it-1");
    expect(mockRequireSession).toHaveBeenCalled();
  });

  it("propagates AuthGuardError status from requireSession", async () => {
    mockRequireSession.mockRejectedValue(new AuthGuardError("Unauthorized", 401));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects invalid reconcile payload with 422", async () => {
    const res = await POST(jsonReq({ biaya_subkontrak: 0 }), {
      params: Promise.resolve({ id: "it-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toBe("Data reconcile pending maklon tidak valid");
    expect(mockReconcilePendingMaklonItem).not.toHaveBeenCalled();
  });

  it("reconciles pending maklon using guarded session uid", async () => {
    const res = await POST(
      jsonReq({
        vendor_subkontrak_id: "v-1",
        biaya_subkontrak: "75000",
        metode_bayar_vendor: "TRANSFER",
      }),
      { params: Promise.resolve({ id: "it-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe("Pending maklon berhasil direconcile");
    expect(mockRequireOperationalRole).toHaveBeenCalled();
    expect(mockReconcilePendingMaklonItem).toHaveBeenCalledWith("it-1", {
      vendor_subkontrak_id: "v-1",
      biaya_subkontrak: 75000,
      metode_bayar_vendor: "TRANSFER",
      dibuat_oleh: "u-2",
    });
  });

  it("propagates AuthGuardError status from requireOperationalRole", async () => {
    mockRequireOperationalRole.mockRejectedValue(
      new AuthGuardError("Forbidden", 403),
    );

    const res = await POST(
      jsonReq({
        vendor_subkontrak_id: "v-1",
        biaya_subkontrak: 75000,
        metode_bayar_vendor: "CASH",
      }),
      { params: Promise.resolve({ id: "it-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden");
    expect(mockReconcilePendingMaklonItem).not.toHaveBeenCalled();
  });

  it("surfaces non-AuthGuard service errors as 500 with service message", async () => {
    mockReconcilePendingMaklonItem.mockRejectedValue(
      new Error("Item bukan pending maklon"),
    );

    const res = await POST(
      jsonReq({
        vendor_subkontrak_id: "v-1",
        biaya_subkontrak: 75000,
        metode_bayar_vendor: "CASH",
      }),
      { params: Promise.resolve({ id: "it-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Item bukan pending maklon");
  });
});