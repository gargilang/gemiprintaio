import { canDeleteCashBookEntry } from "../services/finance-service";

describe("canDeleteCashBookEntry", () => {
  it("manual entry (tanpa reference_type) → true", () => {
    expect(canDeleteCashBookEntry({})).toBe(true);
    expect(canDeleteCashBookEntry({ reference_type: null })).toBe(true);
  });
  it("reference_type SALE → false", () => {
    expect(canDeleteCashBookEntry({ reference_type: "SALE" })).toBe(false);
  });
  it("reference_type PURCHASE → false", () => {
    expect(canDeleteCashBookEntry({ reference_type: "PURCHASE" })).toBe(false);
  });
  it("reference_type PINJAMAN_KARYAWAN → false", () => {
    expect(
      canDeleteCashBookEntry({ reference_type: "PINJAMAN_KARYAWAN" }),
    ).toBe(false);
  });
  it("fallback: keperluan mengandung [REF:purchase- → false", () => {
    expect(
      canDeleteCashBookEntry({ keperluan: "Bayar [REF:purchase-abc123]" }),
    ).toBe(false);
  });
  it("fallback: keperluan mengandung [REF:pinjaman- → false", () => {
    expect(
      canDeleteCashBookEntry({ keperluan: "Tarik [REF:pinjaman-xyz]" }),
    ).toBe(false);
  });
  it("fallback: keperluan mengandung [REF:sale- → false", () => {
    expect(
      canDeleteCashBookEntry({ keperluan: "Penjualan [REF:sale-inv042]" }),
    ).toBe(false);
  });
});
