/**
 * Unit tests for document number generator.
 *
 * Verifies the format `<PREFIX>-YYYYMMDD-NNN` and that the next sequence
 * picks up the highest existing seq for that day across DRAFT/SENT/etc.
 */

jest.mock("@/lib/db-unified", () => {
  const queryFn = jest.fn();
  return {
    db: { query: queryFn },
    __queryFn: queryFn,
  };
});

import { generateDailyDocumentNumber } from "../services/document-number-service";

const { __queryFn: queryFn } = jest.requireMock("@/lib/db-unified") as {
  __queryFn: jest.Mock;
};

describe("generateDailyDocumentNumber", () => {
  beforeEach(() => {
    queryFn.mockReset();
  });

  it("mulai dari 001 ketika belum ada baris", async () => {
    queryFn.mockResolvedValueOnce({ data: [], error: null });
    const result = await generateDailyDocumentNumber(
      "penawaran",
      "nomor_penawaran",
      "QUO",
      "2026-05-25"
    );
    expect(result).toBe("QUO-20260525-001");
  });

  it("naik dari urutan tertinggi yang ada di hari yang sama", async () => {
    queryFn.mockResolvedValueOnce({
      data: [
        { nomor_penawaran: "QUO-20260525-001" },
        { nomor_penawaran: "QUO-20260525-007" },
        { nomor_penawaran: "QUO-20260524-099" }, // wrong day, ignored
        { nomor_penawaran: "QUO-20260525-003" },
      ],
      error: null,
    });
    const result = await generateDailyDocumentNumber(
      "penawaran",
      "nomor_penawaran",
      "QUO",
      "2026-05-25"
    );
    expect(result).toBe("QUO-20260525-008");
  });

  it("mengabaikan baris dengan prefix berbeda di hari yang sama", async () => {
    queryFn.mockResolvedValueOnce({
      data: [
        { nomor_po: "PO-20260525-002" },
        { nomor_po: "PO-20260525-009" },
        { nomor_po: "RJ-20260525-099" },
        { nomor_po: "INV/V/2026/0001" },
      ],
      error: null,
    });
    const result = await generateDailyDocumentNumber(
      "purchase_orders",
      "nomor_po",
      "PO",
      "2026-05-25"
    );
    expect(result).toBe("PO-20260525-010");
  });

  it.each([
    ["QUO", "2026-05-25", "QUO-20260525-001"],
    ["PO", "2026-05-25", "PO-20260525-001"],
    ["RJ", "2026-05-25", "RJ-20260525-001"],
    ["RP", "2026-05-25", "RP-20260525-001"],
    ["SO", "2026-05-25", "SO-20260525-001"],
  ])("formats %s prefix as %s on %s", async (prefix, date, expected) => {
    queryFn.mockResolvedValueOnce({ data: [], error: null });
    const result = await generateDailyDocumentNumber(
      "any_table",
      "nomor",
      prefix,
      date
    );
    expect(result).toBe(expected);
  });

  it("meneruskan error db", async () => {
    const error = new Error("simulated db failure");
    queryFn.mockResolvedValueOnce({ data: null, error });
    await expect(
      generateDailyDocumentNumber("penawaran", "nomor_penawaran", "QUO", "2026-05-25")
    ).rejects.toBe(error);
  });

  it("mengabaikan urutan yang malformed dan kembalikan nomor berikutnya", async () => {
    queryFn.mockResolvedValueOnce({
      data: [
        { nomor_retur: "RJ-20260525-XYZ" },
        { nomor_retur: "RJ-20260525-005" },
        { nomor_retur: "RJ-20260525-" },
      ],
      error: null,
    });
    const result = await generateDailyDocumentNumber(
      "retur_penjualan",
      "nomor_retur",
      "RJ",
      "2026-05-25"
    );
    expect(result).toBe("RJ-20260525-006");
  });

  it("memformat urutan > 999 tanpa memutus padding", async () => {
    queryFn.mockResolvedValueOnce({
      data: [{ nomor: "PO-20260525-1234" }],
      error: null,
    });
    const result = await generateDailyDocumentNumber(
      "purchase_orders",
      "nomor",
      "PO",
      "2026-05-25"
    );
    expect(result).toBe("PO-20260525-1235");
  });
});
