/**
 * surat-jalan-service: SQLite fallback enrichment, no N+1.
 * getServerSupabaseClient mocked → null forces the SQLite branch.
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
    getServerSupabaseClient: () => null,
  };
});

import { getSuratJalan } from "../services/surat-jalan-service";

beforeEach(() => resetMockDb());

describe("getSuratJalan SQLite fallback (no N+1)", () => {
  it("attaches items, nomor_faktur, and dibuat_oleh_nama in batch", async () => {
    mockTable("penjualan").set("s1", { id: "s1", nomor_faktur: "INV-1" });
    mockTable("profil").set("u1", { id: "u1", nama_lengkap: "Budi" });
    mockTable("surat_jalan").set("sj1", {
      id: "sj1", penjualan_id: "s1", dibuat_oleh: "u1", dibuat_pada: "2026-05-25",
    });
    mockTable("surat_jalan").set("sj2", {
      id: "sj2", penjualan_id: null, dibuat_oleh: null, dibuat_pada: "2026-05-26",
    });
    mockTable("item_surat_jalan").set("isj1", { id: "isj1", surat_jalan_id: "sj1", urutan: 2 });
    mockTable("item_surat_jalan").set("isj2", { id: "isj2", surat_jalan_id: "sj1", urutan: 1 });

    __mock.db.query.mockClear();
    __mock.db.queryOne.mockClear();

    const list = await getSuratJalan();
    const byId = Object.fromEntries(list.map((s: any) => [s.id, s]));
    expect(byId["sj1"].nomor_faktur).toBe("INV-1");
    expect(byId["sj1"].dibuat_oleh_nama).toBe("Budi");
    expect(byId["sj1"].items.map((i: any) => i.urutan)).toEqual([1, 2]);
    expect(byId["sj2"].nomor_faktur).toBeNull();
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });
});
