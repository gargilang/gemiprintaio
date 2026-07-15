import { groupReceivablesByCustomer } from "@/lib/services/pos-queries";
import type { Receivable } from "@/lib/services/pos-queries";

const mk = (o: Partial<Receivable> & { id: string }): Receivable => {
  const base: Receivable = {
    id: o.id,
    id_penjualan: o.id_penjualan || o.id,
    sisa_piutang: o.sisa_piutang ?? 0,
    jumlah_piutang: o.jumlah_piutang ?? o.sisa_piutang ?? 0,
    jumlah_terbayar: o.jumlah_terbayar ?? 0,
    status: o.status || "AKTIF",
    pelanggan_id: o.pelanggan_id ?? null,
    pelanggan_nama: o.pelanggan_nama,
    dibuat_pada: o.dibuat_pada,
  };
  return { ...base, ...o };
};

it("kelompokkan per pelanggan_id + FIFO + total", () => {
  const rows = [
    mk({ id: "b", pelanggan_id: "didi", sisa_piutang: 300000, dibuat_pada: "2026-02-01" }),
    mk({ id: "a", pelanggan_id: "didi", sisa_piutang: 50000, dibuat_pada: "2026-01-01" }),
  ];
  const g = groupReceivablesByCustomer(rows);
  expect(g).toHaveLength(1);
  expect(g[0].pelanggan_id).toBe("didi");
  expect(g[0].total_sisa).toBe(350000);
  expect(g[0].jumlah_tagihan).toBe(2);
  expect(g[0].tagihan.map((t) => t.id)).toEqual(["a", "b"]); // FIFO tertua dulu
});

it("walk-in dikelompokkan per nama snapshot (case-insensitive)", () => {
  const rows = [
    mk({ id: "1", pelanggan_id: null, pelanggan_nama: "Budi", sisa_piutang: 10000 }),
    mk({ id: "2", pelanggan_id: null, pelanggan_nama: "budi", sisa_piutang: 20000 }),
  ];
  const g = groupReceivablesByCustomer(rows);
  expect(g).toHaveLength(1);
  expect(g[0].is_walk_in).toBe(true);
  expect(g[0].total_sisa).toBe(30000);
});

it("walk-in tanpa nama → grup __tanpa_nama__", () => {
  const rows = [mk({ id: "1", pelanggan_id: null, pelanggan_nama: "", sisa_piutang: 5000 })];
  const g = groupReceivablesByCustomer(rows);
  expect(g[0].customerKey).toBe("__tanpa_nama__");
});
