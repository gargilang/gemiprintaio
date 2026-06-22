import { getCurrentMonthRangeJakarta } from "@/lib/date-utils";

describe("getCurrentMonthRangeJakarta", () => {
  it("mengembalikan rentang bulan Jakarta dari tanggal referensi", () => {
    expect(getCurrentMonthRangeJakarta(new Date("2026-06-22T20:00:00.000Z"))).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("menghormati perpindahan hari di zona waktu Jakarta", () => {
    expect(getCurrentMonthRangeJakarta(new Date("2026-02-28T18:00:00.000Z"))).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
  });
});
