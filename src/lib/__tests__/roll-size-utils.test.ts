import {
  getBillableDimensionsForRoll,
  suggestCheapestRollSize,
  suggestSmallestCoveringRollSize,
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

  it("picks roll with minimum billable area", () => {
    expect(suggestCheapestRollSize(1.2, 2.7, rolls)).toBe(3);
  });

  it("recommends 1.5 m roll for 1.4 m x 10 m", () => {
    const roll = suggestCheapestRollSize(1.4, 10, rolls);
    const billed = getBillableDimensionsForRoll(1.4, 10, roll);
    expect(roll).toBe(1.5);
    expect(billed!.area).toBeCloseTo(15);
  });

  it("allows operator to rotate a 0.8 m x 1.3 m job on a 1.5 m roll", () => {
    const billedRoll = suggestSmallestCoveringRollSize(0.8, 1.3, rolls);
    const actual = getBillableDimensionsForRoll(0.8, 1.3, 1.5);
    expect(billedRoll).toBe(1);
    expect(actual).not.toBeNull();
    expect(actual!.area).toBeCloseTo(1.2);
    expect(actual!.usesRotation).toBe(true);
  });
});
