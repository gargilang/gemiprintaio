import { hitungPersenDonut } from "@/lib/dashboard-donut";

describe("hitungPersenDonut", () => {
  it("mengembalikan persentase hari ini terhadap kemarin (dibulatkan)", () => {
    expect(hitungPersenDonut(75, 100)).toBe(75);
    expect(hitungPersenDonut(150, 100)).toBe(150);
    expect(hitungPersenDonut(33, 99)).toBe(33);
  });

  it("aman dari pembagian nol: kemarin 0 dan hari ini > 0 => 100", () => {
    expect(hitungPersenDonut(5000, 0)).toBe(100);
  });

  it("kemarin 0 dan hari ini 0 => 0", () => {
    expect(hitungPersenDonut(0, 0)).toBe(0);
  });

  it("nilai negatif/NaN diperlakukan sebagai 0", () => {
    expect(hitungPersenDonut(Number.NaN, 100)).toBe(0);
    expect(hitungPersenDonut(-50, 100)).toBe(0);
  });
});
