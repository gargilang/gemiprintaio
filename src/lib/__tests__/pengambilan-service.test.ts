jest.mock("@/lib/db-unified", () => ({
  db: { query: jest.fn(), queryOne: jest.fn() },
}));

import { db } from "@/lib/db-unified";
import { listPengambilanBelumDiambil } from "@/lib/services/pengambilan-service";

describe("pengambilan-service", () => {
  it("hanya mengembalikan order SIAP_AMBIL non-VOID", async () => {
    (db.query as jest.Mock).mockImplementation(async (table: string) => {
      if (table === "order_produksi")
        return {
          data: [
            {
              id: "o1",
              nomor_spk: "SPK-0001",
              penjualan_id: "s1",
              status: "SIAP_AMBIL",
            },
          ],
          error: null,
        };
      if (table === "penjualan")
        return {
          data: [
            {
              id: "s1",
              nomor_faktur: "INV-1",
              pelanggan_id: "c1",
              status_transaksi: "POSTED",
              total_jumlah: 100000,
              jumlah_dibayar: 0,
            },
          ],
          error: null,
        };
      if (table === "pelanggan")
        return { data: [{ id: "c1", nama: "Budi" }], error: null };
      if (table === "piutang_penjualan")
        return {
          data: [
            {
              id: "p1",
              id_penjualan: "s1",
              sisa_piutang: 100000,
              status: "AKTIF",
            },
          ],
          error: null,
        };
      if (table === "item_produksi")
        return {
          data: [{ order_produksi_id: "o1", barang_nama: "Stiker" }],
          error: null,
        };
      return { data: [], error: null };
    });

    const rows = await listPengambilanBelumDiambil();
    expect(rows).toHaveLength(1);
    expect(rows[0].nomor_spk).toBe("SPK-0001");
    expect(rows[0].sisa_piutang).toBe(100000);
    expect(rows[0].status_bayar).toBe("PIUTANG");
  });
});
