/**
 * Pembatalan proses gaji & revert pinjaman karyawan.
 *
 * Coverage:
 *   - batalkanProsesGaji: hapus kas [REF:gaji-<id>], baris POTONG_GAJI di-soft
 *     delete, slip + run jadi VOIDED. Guard: hanya status DIBAYAR.
 *   - revertPinjaman: hapus kas [REF:pinjaman-<id>], baris pinjaman soft delete.
 *     Guard: tolak revert baris POTONG_GAJI.
 */

import { resetMockDb, mockTable } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

const recalculateCashbookIfAvailableMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) =>
    recalculateCashbookIfAvailableMock(...args),
  resolveOpenPeriodeIdForKeuangan: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/services/accounting-periods-service", () => ({
  __esModule: true,
  isDateInClosedPeriod: async () => false,
}));

import { batalkanProsesGaji } from "../services/penggajian-service";
import { revertPinjaman } from "../services/pinjaman-karyawan-service";

beforeEach(() => {
  resetMockDb();
  recalculateCashbookIfAvailableMock.mockReset().mockResolvedValue(undefined);
});

describe("batalkanProsesGaji", () => {
  test("hapus kas, soft-delete potongan, VOIDED slip + run", async () => {
    mockTable("proses_gaji").set("R1", { id: "R1", status: "DIBAYAR" });
    mockTable("keuangan").set("K1", {
      id: "K1",
      reference_id: "R1",
      keperluan: "Gaji periode [REF:gaji-R1]",
    });
    mockTable("pinjaman_karyawan").set("PG1", {
      id: "PG1",
      proses_gaji_id: "R1",
      jenis: "POTONG_GAJI",
      is_deleted: 0,
    });
    mockTable("slip_gaji").set("SL1", {
      id: "SL1",
      proses_gaji_id: "R1",
      status: "DIBAYAR",
    });

    await batalkanProsesGaji("R1", "user-1");

    expect(mockTable("keuangan").size).toBe(0);
    expect(mockTable("pinjaman_karyawan").get("PG1").is_deleted).toBe(1);
    expect(mockTable("slip_gaji").get("SL1").status).toBe("VOIDED");
    expect(mockTable("proses_gaji").get("R1").status).toBe("VOIDED");
  });

  test("tolak bila status bukan DIBAYAR", async () => {
    mockTable("proses_gaji").set("R2", { id: "R2", status: "DRAFT" });
    await expect(batalkanProsesGaji("R2")).rejects.toThrow(/DIBAYAR/i);
  });
});

describe("revertPinjaman", () => {
  test("hapus kas [REF:pinjaman-<id>] + soft-delete baris", async () => {
    mockTable("pinjaman_karyawan").set("L1", {
      id: "L1",
      jenis: "TARIK",
      is_deleted: 0,
    });
    mockTable("keuangan").set("K1", {
      id: "K1",
      reference_id: "L1",
      keperluan: "Kasbon [REF:pinjaman-L1]",
    });

    await revertPinjaman("L1");

    expect(mockTable("keuangan").size).toBe(0);
    expect(mockTable("pinjaman_karyawan").get("L1").is_deleted).toBe(1);
  });

  test("tolak revert baris POTONG_GAJI", async () => {
    mockTable("pinjaman_karyawan").set("L2", {
      id: "L2",
      jenis: "POTONG_GAJI",
      is_deleted: 0,
    });
    await expect(revertPinjaman("L2")).rejects.toThrow(/proses gaji/i);
  });
});
