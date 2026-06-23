/**
 * Test agregasi metrik periode langsung dari tabel keuangan.
 *
 * Logika berdasarkan formula AST di src/lib/ast/defaults.ts:
 *   Omzet        : debit  bila kategori OMZET / PIUTANG;
 *                  -kredit bila RETUR_PENJUALAN / RETUR_PENJUALAN_NONCASH.
 *   Biaya Ops    : kredit bila kategori BIAYA / TABUNGAN / GAJI.
 *   Biaya Bahan  : kredit bila HPP; -debit bila RETUR_HPP.
 *   Laba Bersih  : omzet − biaya_operasional − biaya_bahan.
 *   Baris VOIDED : tidak dihitung.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual(
    "./helpers/mock-db"
  ) as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

import { computePeriodMetrics } from "../services/periode-metrics-service";

const PERIODE_ID = "periode-mei-2026";

function seedRow(
  id: string,
  opts: {
    kategori: string;
    debit?: number;
    kredit?: number;
    voided?: boolean;
    periodeId?: string;
  }
) {
  mockTable("keuangan").set(id, {
    id,
    periode_id: opts.periodeId ?? PERIODE_ID,
    kategori_transaksi: opts.kategori,
    debit: opts.debit ?? 0,
    kredit: opts.kredit ?? 0,
    status_transaksi: opts.voided ? "VOIDED" : "POSTED",
    tanggal: "2026-05-01",
  });
}

beforeEach(() => {
  resetMockDb();
});

describe("computePeriodMetrics", () => {
  it("mengembalikan nol bila tidak ada transaksi", async () => {
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m).toEqual({ omzet: 0, biaya_operasional: 0, biaya_bahan: 0, laba_bersih: 0 });
  });

  it("menghitung omzet dari kategori OMZET", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000);
    expect(m.laba_bersih).toBe(5_000_000);
  });

  it("menghitung omzet dari kategori PIUTANG", async () => {
    seedRow("k1", { kategori: "PIUTANG", debit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(3_000_000);
  });

  it("mengurangi omzet untuk RETUR_PENJUALAN (kredit)", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "RETUR_PENJUALAN", kredit: 1_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(4_000_000);
  });

  it("menghitung biaya_operasional dari BIAYA", async () => {
    seedRow("k1", { kategori: "BIAYA", kredit: 2_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_operasional).toBe(2_000_000);
  });

  it("menghitung biaya_operasional dari TABUNGAN dan GAJI", async () => {
    seedRow("k1", { kategori: "TABUNGAN", kredit: 500_000 });
    seedRow("k2", { kategori: "GAJI", kredit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_operasional).toBe(3_500_000);
  });

  it("menghitung biaya_bahan dari HPP", async () => {
    seedRow("k1", { kategori: "HPP", kredit: 1_500_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_bahan).toBe(1_500_000);
  });

  it("mengurangi biaya_bahan untuk RETUR_HPP (debit)", async () => {
    seedRow("k1", { kategori: "HPP", kredit: 1_500_000 });
    seedRow("k2", { kategori: "RETUR_HPP", debit: 500_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.biaya_bahan).toBe(1_000_000);
  });

  it("menghitung laba_bersih = omzet - biaya_ops - biaya_bahan", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 10_000_000 });
    seedRow("k2", { kategori: "BIAYA", kredit: 2_000_000 });
    seedRow("k3", { kategori: "HPP", kredit: 3_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(10_000_000);
    expect(m.biaya_operasional).toBe(2_000_000);
    expect(m.biaya_bahan).toBe(3_000_000);
    expect(m.laba_bersih).toBe(5_000_000);
  });

  it("mengabaikan transaksi VOIDED", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "OMZET", debit: 2_000_000, voided: true });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000); // k2 tidak terhitung
  });

  it("mengabaikan transaksi dari periode lain", async () => {
    seedRow("k1", { kategori: "OMZET", debit: 5_000_000 });
    seedRow("k2", { kategori: "OMZET", debit: 2_000_000, periodeId: "periode-lain" });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(5_000_000); // k2 tidak masuk
  });

  it("tidak menghitung KAS, PINJAMAN_KARYAWAN, INVESTOR ke metrik", async () => {
    seedRow("k1", { kategori: "KAS", debit: 10_000_000 });
    seedRow("k2", { kategori: "PINJAMAN_KARYAWAN", kredit: 500_000 });
    seedRow("k3", { kategori: "INVESTOR", debit: 5_000_000 });
    const m = await computePeriodMetrics(PERIODE_ID);
    expect(m.omzet).toBe(0);
    expect(m.biaya_operasional).toBe(0);
    expect(m.biaya_bahan).toBe(0);
  });
});
