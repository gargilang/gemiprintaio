/**
 * Test getOrCreateOpenPeriod dan formatPeriodLabel.
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

import {
  getOrCreateOpenPeriod,
  formatPeriodLabel,
} from "../services/accounting-periods-service";

beforeEach(() => {
  resetMockDb();
});

describe("formatPeriodLabel", () => {
  it("mengkonversi '2026-05' menjadi 'Mei 2026'", () => {
    expect(formatPeriodLabel("2026-05")).toBe("Mei 2026");
  });
  it("mengkonversi '2026-01' menjadi 'Januari 2026'", () => {
    expect(formatPeriodLabel("2026-01")).toBe("Januari 2026");
  });
  it("mengkonversi '2026-12' menjadi 'Desember 2026'", () => {
    expect(formatPeriodLabel("2026-12")).toBe("Desember 2026");
  });
});

describe("getOrCreateOpenPeriod", () => {
  it("mengembalikan periode OPEN yang sudah ada", async () => {
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei",
      period_key: "2026-05",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      status: "OPEN",
    });

    const result = await getOrCreateOpenPeriod();
    expect(result.id).toBe("p-mei");
    expect(result.status).toBe("OPEN");
  });

  it("tidak mengembalikan periode CLOSED", async () => {
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei",
      period_key: "2026-05",
      start_date: "2026-05-01",
      end_date: "2026-05-31",
      status: "CLOSED",
    });

    // Tidak ada periode OPEN — harus buat yang baru untuk bulan berjalan
    const result = await getOrCreateOpenPeriod();
    expect(result.status).toBe("OPEN");
    expect(result.id).not.toBe("p-mei");
  });

  it("membuat periode baru bila tidak ada yang OPEN", async () => {
    // DB kosong
    const result = await getOrCreateOpenPeriod();
    expect(result.status).toBe("OPEN");
    expect(result.period_key).toMatch(/^\d{4}-\d{2}$/);
  });

  it("mengembalikan periode OPEN terbaru bila ada lebih dari satu OPEN", async () => {
    mockTable("accounting_periods").set("p-apr", {
      id: "p-apr", period_key: "2026-04", start_date: "2026-04-01",
      end_date: "2026-04-30", status: "OPEN",
    });
    mockTable("accounting_periods").set("p-mei", {
      id: "p-mei", period_key: "2026-05", start_date: "2026-05-01",
      end_date: "2026-05-31", status: "OPEN",
    });

    const result = await getOrCreateOpenPeriod();
    expect(result.id).toBe("p-mei"); // terbaru dari period_key DESC
  });
});
