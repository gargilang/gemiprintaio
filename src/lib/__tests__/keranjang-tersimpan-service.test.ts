import { resetMockDb } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

// jadikanPenawaran memanggil createQuotation — kita mock agar test fokus ke
// pemetaan cart → penawaran + transisi status, bukan ke internal quotation-service
// (yang punya test sendiri).
jest.mock("@/lib/services/quotation-service", () => ({
  createQuotation: jest.fn(async () => ({
    id: "penawaran-1",
    nomor_penawaran: "QUO-20260704-001",
  })),
}));

import {
  parkCart,
  listParkedCarts,
  loadParkedCart,
  deleteParkedCart,
  markFinal,
  jadikanPenawaran,
} from "../services/keranjang-tersimpan-service";
import { createQuotation } from "@/lib/services/quotation-service";

const createQuotationMock = createQuotation as unknown as jest.Mock;

describe("keranjang-tersimpan-service", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("parkir menyimpan cart_snapshot dan set kedaluwarsa 30 hari", async () => {
    const r = await parkCart(
      {
        label: "Budi · 2 item · 14:30",
        prioritas: "NORMAL",
        cart_snapshot: [{ barang_nama: "X", jumlah: 1, harga_satuan: 1000 }],
      },
      "kasir-1",
    );
    expect(r.id).toBeTruthy();
    expect(r.status).toBe("AKTIF");
    expect(r.kedaluwarsa_pada).toBeTruthy();
    const all = await listParkedCarts();
    expect(all).toHaveLength(1);
  });

  it("load mengembalikan cart_snapshot utuh", async () => {
    const r = await parkCart(
      {
        label: "L",
        prioritas: "NORMAL",
        cart_snapshot: [
          {
            a: 1,
            tipe_item: "MAKLON",
            vendor_subkontrak_id: "v1",
            biaya_subkontrak: 5,
          },
        ],
      },
      "u",
    );
    const loaded = await loadParkedCart(r.id);
    expect(loaded?.cart_snapshot).toEqual([
      {
        a: 1,
        tipe_item: "MAKLON",
        vendor_subkontrak_id: "v1",
        biaya_subkontrak: 5,
      },
    ]);
  });

  it("markFinal set status FINAL", async () => {
    const r = await parkCart(
      { label: "L", prioritas: "NORMAL", cart_snapshot: [] },
      "u",
    );
    await markFinal(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });

  it("delete soft-delete", async () => {
    const r = await parkCart(
      { label: "L", prioritas: "NORMAL", cart_snapshot: [] },
      "u",
    );
    await deleteParkedCart(r.id);
    const all = await listParkedCarts();
    expect(all).toHaveLength(0);
  });

  it("jadikanPenawaran membuat penawaran & menandai status JADIKAN_PENAWARAN", async () => {
    createQuotationMock.mockClear();
    const parked = await parkCart(
      { label: "L", prioritas: "NORMAL", cart_snapshot: [] },
      "u",
    );
    const items = [
      {
        barang_id: "b1",
        harga_satuan_id: null,
        jumlah: 2,
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 10000,
        tipe_item: "BARANG",
      },
      {
        barang_id: "barang-jasa-maklon",
        harga_satuan_id: null,
        jumlah: 1,
        nama_satuan: "pcs",
        faktor_konversi: 1,
        harga_satuan: 75000,
        tipe_item: "MAKLON",
        vendor_subkontrak_id: "v1",
        biaya_subkontrak: 50000,
        metode_bayar_vendor: "CASH",
        deskripsi_pekerjaan: "Banner Spanduk 3x1",
      },
    ];

    const result = await jadikanPenawaran(parked.id, items as any, {
      dibuatOleh: "u",
    });

    expect(result).toEqual({
      penawaran_id: "penawaran-1",
      nomor_penawaran: "QUO-20260704-001",
    });
    expect(createQuotationMock).toHaveBeenCalledTimes(1);
    expect(createQuotationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dibuat_oleh: "u",
        items: expect.arrayContaining([
          expect.objectContaining({
            tipe_item: "MAKLON",
            vendor_subkontrak_id: "v1",
            biaya_subkontrak: 50000,
            metode_bayar_vendor: "CASH",
            deskripsi_pekerjaan: "Banner Spanduk 3x1",
          }),
        ]),
      }),
    );

    const loaded = await loadParkedCart(parked.id);
    expect(loaded?.status).toBe("JADIKAN_PENAWARAN");
    expect(loaded?.penawaran_id).toBe("penawaran-1");
    // status JADIKAN_PENAWARAN hilang dari list AKTIF
    expect(await listParkedCarts()).toHaveLength(0);
  });
});
