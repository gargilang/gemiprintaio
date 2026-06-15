/**
 * Unit Tests for db-unified.ts
 */

import {
  normalizeRecord,
  generateId,
  getCurrentTimestamp,
  db,
} from "../db-unified";
import { resetMockDb, mockTable, __mock } from "./helpers/mock-db";

// Real-path coverage: mock handle better-sqlite3 (getServerSQLite di ./db-sqlite)
// supaya kita bisa menangkap SQL + params yang dibangun queryServerSQLite —
// bukan sekadar paritas mock matchesWhere.
const mockSqlCalls: { sql: string; params: any[] }[] = [];
jest.mock("../db-sqlite", () => ({
  getServerSQLite: jest.fn(async () => ({
    prepare: (sql: string) => ({
      all: (...params: any[]) => {
        mockSqlCalls.push({ sql, params });
        return [];
      },
    }),
  })),
  serverSqliteColumnsCache: new Map(),
  SYNC_V2_TABLES: [],
}));

describe("normalizeRecord", () => {
  describe("konversi toSupabase", () => {
    it("seharusnya konversi format SQLite ke Supabase", () => {
      const input = {
        aktif: 1,
        privat_status: 0,
        dibuat_pada: "2025-11-14T10:00:00Z",
        diperbarui_pada: "2025-11-14T11:00:00Z",
      };

      const output = normalizeRecord(input, "toSupabase");

      expect(output.aktif).toBe(true);
      expect(output.privat_status).toBe(false);
      // Timestamps unchanged (no conversion)
      expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
      expect(output.diperbarui_pada).toBe("2025-11-14T11:00:00Z");
    });

    it("seharusnya konversi 0 ke false untuk field boolean", () => {
      const input = {
        aktif: 0,
        is_active: 0,
        has_permission: 0,
      };

      const output = normalizeRecord(input, "toSupabase");

      expect(output.aktif).toBe(false);
      expect(output.is_active).toBe(false);
      expect(output.has_permission).toBe(false);
    });

    it("seharusnya tidak konversi field numerik non-boolean", () => {
      const input = {
        jumlah_stok: 100,
        harga: 50000,
      };

      const output = normalizeRecord(input, "toSupabase");

      expect(output.jumlah_stok).toBe(100);
      expect(output.harga).toBe(50000);
    });
  });

  describe("konversi toSQLite", () => {
    it("seharusnya konversi format Supabase ke SQLite", () => {
      const input = {
        aktif: true,
        privat_status: false,
        dibuat_pada: "2025-11-14T10:00:00Z",
        diperbarui_pada: "2025-11-14T11:00:00Z",
      };

      const output = normalizeRecord(input, "toSQLite");

      expect(output.aktif).toBe(1);
      expect(output.privat_status).toBe(0);
      // Timestamps unchanged (no conversion)
      expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
      expect(output.diperbarui_pada).toBe("2025-11-14T11:00:00Z");
    });

    it("seharusnya konversi false ke 0", () => {
      const input = {
        aktif: false,
        is_active: false,
      };

      const output = normalizeRecord(input, "toSQLite");

      expect(output.aktif).toBe(0);
      expect(output.is_active).toBe(0);
    });
  });

  describe("konversi fromSQLite", () => {
    it("seharusnya konversi SQLite ke format aplikasi", () => {
      const input = {
        aktif: 1,
        is_active: 0,
      };

      const output = normalizeRecord(input, "fromSQLite");

      expect(output.aktif).toBe(true);
      expect(output.is_active).toBe(false);
    });
  });

  describe("konversi fromSupabase", () => {
    it("seharusnya konversi Supabase ke format aplikasi", () => {
      const input = {
        aktif: true,
        is_active: false,
      };

      const output = normalizeRecord(input, "fromSupabase");

      expect(output.aktif).toBe(1);
      expect(output.is_active).toBe(0);
    });

    it("seharusnya men-stringify field JSONB untuk binding SQLite", () => {
      const input = {
        metric_contributions: [{ column: "omzet", amount_field: "debit", sign: 1 }],
      };

      const output = normalizeRecord(input, "fromSupabase");

      expect(output.metric_contributions).toBe(
        '[{"column":"omzet","amount_field":"debit","sign":1}]'
      );
    });
  });

  it("seharusnya mempertahankan field lain tanpa perubahan", () => {
    const input = {
      id: "mat-123",
      nama: "Kertas A4",
      harga: 50000,
      aktif: 1,
      dibuat_pada: "2025-11-14T10:00:00Z",
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.id).toBe("mat-123");
    expect(output.nama).toBe("Kertas A4");
    expect(output.harga).toBe(50000);
    expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
  });
});

describe("generateId", () => {
  it("seharusnya menghasilkan UUID v4 yang valid", () => {
    const id = generateId();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(id).toMatch(uuidRegex);
  });

  it("seharusnya menghasilkan ID yang unik", () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
  });

  it("seharusnya menghasilkan ID dengan versi yang benar (v4)", () => {
    const id = generateId();
    const parts = id.split("-");

    // Version should be 4 (UUID v4)
    expect(parts[2][0]).toBe("4");
  });
});

describe("getCurrentTimestamp", () => {
  it("seharusnya mengembalikan timestamp ISO 8601", () => {
    const ts = getCurrentTimestamp();
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

    expect(ts).toMatch(iso8601Regex);
  });

  it("seharusnya mengembalikan tanggal yang valid", () => {
    const ts = getCurrentTimestamp();
    const date = new Date(ts);

    expect(date.toString()).not.toBe("Invalid Date");
  });

  it("seharusnya mengembalikan waktu saat ini (dalam 1 detik)", () => {
    const before = Date.now();
    const ts = getCurrentTimestamp();
    const after = Date.now();

    const tsTime = new Date(ts).getTime();

    expect(tsTime).toBeGreaterThanOrEqual(before);
    expect(tsTime).toBeLessThanOrEqual(after);
  });

  it("seharusnya mengembalikan zona waktu UTC", () => {
    const ts = getCurrentTimestamp();

    expect(ts).toMatch(/Z$/); // Should end with Z (UTC)
  });
});

describe("Edge Case", () => {
  it("seharusnya menangani objek kosong", () => {
    const input = {};
    const output = normalizeRecord(input, "toSupabase");

    expect(output).toEqual({});
  });

  it("seharusnya menangani nilai null", () => {
    const input = {
      nama: null,
      deskripsi: null,
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.nama).toBeNull();
    expect(output.deskripsi).toBeNull();
  });

  it("seharusnya menangani nilai undefined", () => {
    const input = {
      nama: "Test",
      deskripsi: undefined,
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.nama).toBe("Test");
    expect(output.deskripsi).toBeUndefined();
  });

  it("seharusnya menangani tipe data campuran", () => {
    const input = {
      id: "123",
      nama: "Test",
      harga: 50000,
      aktif: 1,
      dibuat_pada: "2025-11-14T10:00:00Z",
      metadata: { key: "value" },
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.id).toBe("123");
    expect(output.nama).toBe("Test");
    expect(output.harga).toBe(50000);
    expect(output.aktif).toBe(true);
    expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
    expect(output.metadata).toEqual({ key: "value" });
  });
});

describe("array where → IN (batch lookups)", () => {
  beforeEach(() => resetMockDb());

  it("db.query with where: { id: [...] } returns only matching rows", async () => {
    mockTable("barang").set("b1", { id: "b1", nama: "A" });
    mockTable("barang").set("b2", { id: "b2", nama: "B" });
    mockTable("barang").set("b3", { id: "b3", nama: "C" });

    const res = await __mock.db.query("barang", {
      where: { id: ["b1", "b3"] },
    });
    const ids = (res.data || []).map((r: any) => r.id).sort();
    expect(ids).toEqual(["b1", "b3"]);
  });

  it("empty array matches nothing", async () => {
    mockTable("barang").set("b1", { id: "b1", nama: "A" });
    const res = await __mock.db.query("barang", { where: { id: [] } });
    expect(res.data).toEqual([]);
  });
});

describe("queryServerSQLite array where → real SQL builder", () => {
  const SUPABASE_ENV_KEYS = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    // Paksa jalur server SQLite: aktifkan mirror + matikan Supabase (client null).
    savedEnv.GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR =
      process.env.GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR;
    process.env.GEMIPRINT_ENABLE_SERVER_SQLITE_MIRROR = "1";
    for (const k of SUPABASE_ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => {
    mockSqlCalls.length = 0;
  });

  it("non-empty array → WHERE id IN (?, ?) dengan params sesuai urutan", async () => {
    const res = await db.query("barang", { where: { id: ["b1", "b3"] } });
    expect(res.error).toBeNull();
    expect(mockSqlCalls).toHaveLength(1);
    expect(mockSqlCalls[0].sql).toContain("WHERE id IN (?, ?)");
    expect(mockSqlCalls[0].params).toEqual(["b1", "b3"]);
  });

  it("empty array → 0 = 1 (bukan IN ())", async () => {
    const res = await db.query("barang", { where: { id: [] } });
    expect(res.error).toBeNull();
    expect(mockSqlCalls).toHaveLength(1);
    expect(mockSqlCalls[0].sql).toContain("0 = 1");
    expect(mockSqlCalls[0].sql).not.toContain("IN ()");
  });
});
