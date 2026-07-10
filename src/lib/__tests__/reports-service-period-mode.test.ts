/**
 * Test jalur `usePeriodMode` di getFormalAccountingReport (Opsi B).
 *
 * Fokus:
 *  - Saat `periodeId` diberikan, penjualan/pembelian/keuangan difilter by
 *    `periode_id`, BUKAN rentang tanggal kalender.
 *  - Transaksi bertanggal di luar bulan periode (mis. 1-2 Juli untuk periode
 *    Juni yang ditutup 2 Juli) tetap masuk laporan karena periode_id-nya Juni.
 *  - Metrik KPI diagregasi langsung dari baris periode (bebas asumsi
 *    kontiguitas running total) sehingga cocok dengan baris buku kas.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db",
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

jest.mock("../services/finance-config-service", () => ({
  listFinanceCategories: jest.fn(async () => []),
}));

import { getFormalAccountingReport } from "../services/reports-service";

const PERIODE_JUNI = "periode-juni-2026";
const PERIODE_JULI = "periode-juli-2026";

function seedKeuangan(
  id: string,
  opts: {
    kategori: string;
    debit?: number;
    kredit?: number;
    tanggal: string;
    periodeId: string;
    voided?: boolean;
  },
) {
  mockTable("keuangan").set(id, {
    id,
    kategori_transaksi: opts.kategori,
    debit: opts.debit ?? 0,
    kredit: opts.kredit ?? 0,
    tanggal: opts.tanggal,
    periode_id: opts.periodeId,
    status_transaksi: opts.voided ? "VOIDED" : "POSTED",
    keperluan: `keperluan ${id}`,
    urutan_tampilan: Number(id.replace(/\D/g, "")) || 0,
    omzet: 0,
    biaya_operasional: 0,
    biaya_bahan: 0,
    saldo: 0,
    laba_bersih: 0,
  });
}

function seedPenjualan(
  id: string,
  opts: { total: number; tanggal: string; periodeId: string },
) {
  mockTable("penjualan").set(id, {
    id,
    nomor_faktur: `INV-${id}`,
    total_jumlah: opts.total,
    tanggal: opts.tanggal,
    periode_id: opts.periodeId,
    status_transaksi: "POSTED",
  });
}

beforeEach(() => {
  resetMockDb();
});

describe("getFormalAccountingReport — mode periode_id", () => {
  it("memasukkan transaksi berdasarkan periode_id, bukan tanggal kalender", async () => {
    // Penjualan tanggal 1 Juli tapi periode_id Juni (kasus tutup buku tgl 2 Juli).
    seedPenjualan("s1", {
      total: 5_000_000,
      tanggal: "2026-06-15",
      periodeId: PERIODE_JUNI,
    });
    seedPenjualan("s2", {
      total: 2_000_000,
      tanggal: "2026-07-01",
      periodeId: PERIODE_JUNI,
    });
    // Penjualan yang benar-benar periode Juli — tidak boleh masuk laporan Juni.
    seedPenjualan("s3", {
      total: 9_000_000,
      tanggal: "2026-07-03",
      periodeId: PERIODE_JULI,
    });

    const report = await getFormalAccountingReport({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      periodeId: PERIODE_JUNI,
    });

    // s1 + s2 (keduanya periode Juni), s3 dikecualikan.
    expect(report.profitLoss.revenue).toBe(7_000_000);
    expect(report.profitLoss.salesCount).toBe(2);
  });

  it("mengagregasi metrik buku kas dari baris periode walau tanggal tidak kontigu", async () => {
    // Baris biaya operasional periode Juni.
    seedKeuangan("k1", {
      kategori: "BIAYA",
      kredit: 1_000_000,
      tanggal: "2026-06-20",
      periodeId: PERIODE_JUNI,
    });
    // Baris periode LAIN (Juli) yang tanggalnya menyelip di antara baris Juni.
    seedKeuangan("k2", {
      kategori: "BIAYA",
      kredit: 8_000_000,
      tanggal: "2026-07-02",
      periodeId: PERIODE_JULI,
    });
    // Baris biaya periode Juni lagi, tanggal setelah baris Juli di atas.
    seedKeuangan("k3", {
      kategori: "GAJI",
      kredit: 2_000_000,
      tanggal: "2026-07-01",
      periodeId: PERIODE_JUNI,
    });

    const report = await getFormalAccountingReport({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      periodeId: PERIODE_JUNI,
    });

    // Biaya ops Juni = 1jt + 2jt (k1 & k3 periode Juni; k2 Juli dikecualikan).
    // Ini bukti agregasi bebas dari asumsi kontiguitas running total.
    expect(report.cashReport.operationalExpenses).toBe(3_000_000);
    // Baris buku kas yang ditampilkan = hanya baris periode Juni (2 baris).
    expect(report.cashReport.rows).toHaveLength(2);
  });

  it("mengabaikan baris VOIDED di mode periode", async () => {
    seedKeuangan("k1", {
      kategori: "BIAYA",
      kredit: 5_000_000,
      tanggal: "2026-06-10",
      periodeId: PERIODE_JUNI,
    });
    seedKeuangan("k2", {
      kategori: "BIAYA",
      kredit: 3_000_000,
      tanggal: "2026-06-11",
      periodeId: PERIODE_JUNI,
      voided: true,
    });

    const report = await getFormalAccountingReport({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      periodeId: PERIODE_JUNI,
    });

    expect(report.cashReport.operationalExpenses).toBe(5_000_000);
    expect(report.cashReport.rows).toHaveLength(1);
  });
});
