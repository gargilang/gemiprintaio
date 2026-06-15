/**
 * enrich-utils: helper batch lookup untuk menghapus N+1 di jalur enrichment.
 * Menguji perilaku nyata via mock db-unified (bukan stub per-panggilan).
 */
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

jest.mock("@/lib/db-unified", () => {
  const real = jest.requireActual("./helpers/mock-db") as typeof import("./helpers/mock-db");
  return {
    db: real.__mock.db,
    generateId: real.__mock.generateId,
    getCurrentTimestamp: real.__mock.getCurrentTimestamp,
  };
});

import { buildLookupMap, fetchChildrenByForeignKey } from "../services/enrich-utils";

beforeEach(() => resetMockDb());

describe("buildLookupMap", () => {
  it("fetches only requested ids in a single query (no N+1)", async () => {
    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT A" });
    mockTable("vendor").set("v2", { id: "v2", nama_perusahaan: "PT B" });
    mockTable("vendor").set("v3", { id: "v3", nama_perusahaan: "PT C" });

    const map = await buildLookupMap("vendor", ["v1", "v3"], "nama_perusahaan");

    expect(map.get("v1")?.nama_perusahaan).toBe("PT A");
    expect(map.get("v3")?.nama_perusahaan).toBe("PT C");
    expect(map.has("v2")).toBe(false);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });

  it("dedupes ids and skips the query when the id set is empty", async () => {
    const empty = await buildLookupMap("vendor", []);
    expect(empty.size).toBe(0);
    expect(__mock.db.query).not.toHaveBeenCalled();

    mockTable("vendor").set("v1", { id: "v1", nama_perusahaan: "PT A" });
    await buildLookupMap("vendor", ["v1", "v1", "v1"]);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
  });
});

describe("fetchChildrenByForeignKey", () => {
  it("groups child rows by their foreign key in a single query", async () => {
    mockTable("item_pembelian").set("i1", { id: "i1", pembelian_id: "p1", nama: "x" });
    mockTable("item_pembelian").set("i2", { id: "i2", pembelian_id: "p1", nama: "y" });
    mockTable("item_pembelian").set("i3", { id: "i3", pembelian_id: "p2", nama: "z" });

    const map = await fetchChildrenByForeignKey("item_pembelian", "pembelian_id", ["p1", "p2"]);

    expect(map.get("p1")).toHaveLength(2);
    expect(map.get("p2")).toHaveLength(1);
    expect(__mock.db.query).toHaveBeenCalledTimes(1);
    expect(__mock.db.queryOne).not.toHaveBeenCalled();
  });

  it("returns an empty map when there are no parent ids", async () => {
    const map = await fetchChildrenByForeignKey("item_pembelian", "pembelian_id", []);
    expect(map.size).toBe(0);
    expect(__mock.db.query).not.toHaveBeenCalled();
  });
});
