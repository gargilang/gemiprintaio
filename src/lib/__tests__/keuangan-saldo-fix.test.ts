import {
  computeCashbookRecalculationUpdates,
  computeSingleCashbookRowUpdate,
  sortCashbookRowsForRecalc,
  type CashbookRecalcInputRow,
} from "@/lib/ast/cashbook-recalc";
import { parseLocalizedAmount } from "@/lib/format-id";
import { prevRowMissingGlobalTc } from "@/lib/services/finance-service";

describe("parseLocalizedAmount", () => {
  it("mengurai format ribuan Indonesia", () => {
    expect(parseLocalizedAmount("10.000.000")).toBe(10_000_000);
    expect(parseLocalizedAmount("10000000")).toBe(10_000_000);
    expect(parseLocalizedAmount("1.500")).toBe(1500);
  });

  it("mengembalikan 0 untuk input kosong", () => {
    expect(parseLocalizedAmount("")).toBe(0);
    expect(parseLocalizedAmount(undefined)).toBe(0);
  });
});

describe("computeSingleCashbookRowUpdate", () => {
  const baseRow = (
    id: string,
    order: number,
    kat: string,
    debit = 0,
    kredit = 0,
  ): CashbookRecalcInputRow => ({
    id,
    tanggal: "2026-06-01",
    kategori_transaksi: kat,
    debit,
    kredit,
    keperluan: "",
    urutan_tampilan: order,
    dibuat_pada: `2026-06-01T00:00:0${order}.000Z`,
  });

  it("KAS kredit mengurangi saldo dari prevOutputs", () => {
    const prevOutputs = { J: 31_505_063, saldo: 31_505_063 };
    const row = baseRow("new", 49, "KAS", 0, 10_000_000);
    const result = computeSingleCashbookRowUpdate(row, prevOutputs, 48);
    expect(result.computed.saldo).toBe(21_505_063);
    expect(result.updates.saldo).toBe(21_505_063);
  });

  it("setara dengan baris terakhir recalc penuh", () => {
    const rows = sortCashbookRowsForRecalc([
      baseRow("a", 1, "KAS", 31_505_063, 0),
      baseRow("b", 2, "KAS", 0, 10_000_000),
    ]);
    const full = computeCashbookRecalculationUpdates(rows);
    const prevOutputs = full[0].outputs;
    const incremental = computeSingleCashbookRowUpdate(rows[1], prevOutputs, 1);
    expect(incremental.computed.saldo).toBe(full[1].computed.saldo);
  });
});

describe("computeSingleCashbookRowUpdate — prevOutputs TC-only kosong", () => {
  const row = (
    id: string,
    order: number,
    kat: string,
    debit = 0,
    kredit = 0,
  ): CashbookRecalcInputRow => ({
    id,
    tanggal: "2026-06-01",
    kategori_transaksi: kat,
    debit,
    kredit,
    keperluan: "",
    urutan_tampilan: order,
    dibuat_pada: `2026-06-01T00:00:0${order}.000Z`,
  });

  it("RC-1 — ketika prevOutputs tidak punya kas, kredit menghasilkan kas negatif dari nol (bukan kumulatif)", () => {
    const prevOutputs = {};
    const newRow = row("new", 2, "KAS", 0, 300_000);
    const result = computeSingleCashbookRowUpdate(newRow, prevOutputs, 1);
    expect(result.computed.saldo).toBe(-300_000);
  });

  it("prevOutputs dengan saldo kumulatif menghasilkan nilai yang benar", () => {
    // Formula saldo memakai prev("J"); TC harus punya kunci J (bukan hanya saldo).
    const prevOutputs = { J: 1_500_000, saldo: 1_500_000 };
    const newRow = row("new", 2, "KAS", 0, 300_000);
    const result = computeSingleCashbookRowUpdate(newRow, prevOutputs, 1);
    expect(result.computed.saldo).toBe(1_200_000);
  });
});

describe("prevRowMissingGlobalTc — pengecekan prevOutputs untuk metrik global", () => {
  it("mengembalikan false bila prevRow null (baris pertama di buku kas)", () => {
    expect(prevRowMissingGlobalTc(null, {})).toBe(false);
  });

  it("mengembalikan true bila prevRow ada tapi kas undefined di prevOutputs", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    expect(prevRowMissingGlobalTc(prevRow, { saldo: 1_000 })).toBe(true);
  });

  it("mengembalikan false bila semua tiga metrik global ada (termasuk jika nilainya 0)", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    const prevOutputs = { kas: 0, modal_kas: 500_000, saldo_kasbon: 0 };
    expect(prevRowMissingGlobalTc(prevRow, prevOutputs)).toBe(false);
  });

  it("mengembalikan true bila modal_kas undefined", () => {
    const prevRow = { id: "prev-1" } as unknown as CashbookRecalcInputRow;
    expect(prevRowMissingGlobalTc(prevRow, { kas: 100_000, saldo_kasbon: 0 })).toBe(true);
  });
});
