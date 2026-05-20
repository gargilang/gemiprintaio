import {
  getBillableDimensionsForRoll,
  suggestCheapestRollSize,
} from "../roll-size-utils";

describe("getBillableDimensionsForRoll", () => {
  it("uses shorter side across roll when that is cheapest (1.5 m roll)", () => {
    const billed = getBillableDimensionsForRoll(1.2, 2.7, 1.5);
    expect(billed).not.toBeNull();
    expect(billed!.panjang).toBeCloseTo(1.5);
    expect(billed!.lebar).toBeCloseTo(2.7);
    expect(billed!.area).toBeCloseTo(4.05);
    expect(billed!.usesRotation).toBe(false);
  });

  it("rotates when roll on longer side is cheaper (3 m roll)", () => {
    const billed = getBillableDimensionsForRoll(1.2, 2.7, 3);
    expect(billed).not.toBeNull();
    expect(billed!.panjang).toBeCloseTo(1.2);
    expect(billed!.lebar).toBeCloseTo(3);
    expect(billed!.area).toBeCloseTo(3.6);
    expect(billed!.usesRotation).toBe(true);
  });
});

describe("suggestCheapestRollSize", () => {
  const rolls = [0.5, 1, 1.5, 2, 2.5, 3];

  it("picks roll with minimum billable area (1.2 × 2.7 → 3 m)", () => {
    expect(suggestCheapestRollSize(1.2, 2.7, rolls)).toBe(3);
  });
});
