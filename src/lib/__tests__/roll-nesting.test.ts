import { getNestedRollBilling } from "@/lib/roll-size-utils";

describe("getNestedRollBilling", () => {
  it("kasus A: 2 lembar 1×1.5 di roll 2m → nesting 2/baris, area 3m²", () => {
    const b = getNestedRollBilling(1, 1.5, 2, 2)!;
    expect(b.itemsPerRow).toBe(2);
    expect(b.rows).toBe(1);
    expect(b.totalAreaRoll).toBeCloseTo(3, 5);
    expect(b.areaEfektifPerLembar).toBeCloseTo(1.5, 5);
  });

  it("kasus B: 1 lembar 1.2×1.7 di roll 1.5m → 1/baris, area 2.55m²", () => {
    const b = getNestedRollBilling(1.2, 1.7, 1, 1.5)!;
    expect(b.itemsPerRow).toBe(1);
    expect(b.totalAreaRoll).toBeCloseTo(2.55, 5);
  });

  it("6 lembar 0.9×1.7 di roll 2m → 2/baris, 3 baris, area 10.2m²", () => {
    const b = getNestedRollBilling(0.9, 1.7, 6, 2)!;
    expect(b.itemsPerRow).toBe(2);
    expect(b.rows).toBe(3);
    expect(b.totalPanjangRoll).toBeCloseTo(5.1, 5);
    expect(b.totalAreaRoll).toBeCloseTo(10.2, 5);
  });

  it("baris tak penuh: 5 lembar 0.9×1.7 di roll 2m → orientasi termurah (area 9m²)", () => {
    // Aturan 'total area terkecil': orientasi 1-lembar/baris (1.7m melintang roll,
    // 5 baris × 0.9m = 4.5m) → 2×4.5 = 9m², lebih murah dari nesting 2/baris
    // (3 baris × 1.7m = 5.1m → 10.2m²). Harga adil, tidak overcharge.
    const b = getNestedRollBilling(0.9, 1.7, 5, 2)!;
    expect(b.itemsPerRow).toBe(1);
    expect(b.rows).toBe(5);
    expect(b.totalAreaRoll).toBeCloseTo(9, 5);
  });

  it("jumlah 1 setara rumus roll-aligned lama (1.2×2.7 roll 3m → 3.6m²)", () => {
    const b = getNestedRollBilling(1.2, 2.7, 1, 3)!;
    expect(b.totalAreaRoll).toBeCloseTo(3.6, 5);
    expect(b.usesRotation).toBe(true);
  });

  it("roll terlalu kecil untuk kedua orientasi → null", () => {
    expect(getNestedRollBilling(1.2, 1.7, 1, 1)).toBeNull();
  });
});
