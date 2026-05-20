import {
  allocateCartLineCharges,
  getCartChargeTotal,
  formatRollCartDetailLine,
  getRollPrintLength,
  roundUpToThousand,
} from "../money-rounding";

describe("roundUpToThousand", () => {
  it("rounds up to nearest thousand", () => {
    expect(roundUpToThousand(81250)).toBe(82000);
    expect(roundUpToThousand(81000)).toBe(81000);
  });
});

describe("allocateCartLineCharges", () => {
  it("rounds transaction total once and adjusts last line", () => {
    const items = [{ subtotalRaw: 81250 }, { subtotalRaw: 146250 }];
    expect(allocateCartLineCharges(items, false)).toEqual([81250, 146250]);
    expect(allocateCartLineCharges(items, true)).toEqual([81250, 146750]);
    expect(getCartChargeTotal(items, true)).toBe(228000);
  });
});

describe("formatRollCartDetailLine", () => {
  it("shows print length × roll with catalog rate", () => {
    const line = formatRollCartDetailLine({
      billedPanjang: 1.3,
      billedLebar: 2.5,
      selectedRollSize: 2.5,
      jumlah: 3.25,
      harga_satuan: 25000,
    });
    expect(line).toContain("1.30 × Roll 2.50 m = 3.25 m² @ Rp 25.000");
    expect(getRollPrintLength(1.3, 2.5, 2.5)).toBeCloseTo(1.3);
  });
});
