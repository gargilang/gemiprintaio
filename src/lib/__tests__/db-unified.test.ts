/**
 * Unit Tests for db-unified.ts
 */

import {
  normalizeRecord,
  generateId,
  getCurrentTimestamp,
} from "../db-unified";

describe("normalizeRecord", () => {
  describe("toSupabase conversion", () => {
    it("should convert SQLite to Supabase format", () => {
      const input = {
        aktif: 1,
        privat_status: 0,
        dibuat_pada: "2025-11-14T10:00:00Z",
        diperbarui_pada: "2025-11-14T11:00:00Z",
      };

      const output = normalizeRecord(input, "toSupabase");

      expect(output.aktif).toBe(true);
      expect(output.privat_status).toBe(false);
      // Timestamps tetap sama (tidak ada konversi)
      expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
      expect(output.diperbarui_pada).toBe("2025-11-14T11:00:00Z");
    });

    it("should convert 0 to false for boolean fields", () => {
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

    it("should not convert non-boolean numeric fields", () => {
      const input = {
        jumlah_stok: 100,
        harga: 50000,
      };

      const output = normalizeRecord(input, "toSupabase");

      expect(output.jumlah_stok).toBe(100);
      expect(output.harga).toBe(50000);
    });
  });

  describe("toSQLite conversion", () => {
    it("should convert Supabase to SQLite format", () => {
      const input = {
        aktif: true,
        privat_status: false,
        dibuat_pada: "2025-11-14T10:00:00Z",
        diperbarui_pada: "2025-11-14T11:00:00Z",
      };

      const output = normalizeRecord(input, "toSQLite");

      expect(output.aktif).toBe(1);
      expect(output.privat_status).toBe(0);
      // Timestamps tetap sama (tidak ada konversi)
      expect(output.dibuat_pada).toBe("2025-11-14T10:00:00Z");
      expect(output.diperbarui_pada).toBe("2025-11-14T11:00:00Z");
    });

    it("should convert false to 0", () => {
      const input = {
        aktif: false,
        is_active: false,
      };

      const output = normalizeRecord(input, "toSQLite");

      expect(output.aktif).toBe(0);
      expect(output.is_active).toBe(0);
    });
  });

  describe("fromSQLite conversion", () => {
    it("should convert SQLite to app format", () => {
      const input = {
        aktif: 1,
        is_active: 0,
      };

      const output = normalizeRecord(input, "fromSQLite");

      expect(output.aktif).toBe(true);
      expect(output.is_active).toBe(false);
    });
  });

  describe("fromSupabase conversion", () => {
    it("should convert Supabase to app format", () => {
      const input = {
        aktif: true,
        is_active: false,
      };

      const output = normalizeRecord(input, "fromSupabase");

      expect(output.aktif).toBe(1);
      expect(output.is_active).toBe(0);
    });
  });

  it("should preserve other fields unchanged", () => {
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
  it("should generate valid UUID v4", () => {
    const id = generateId();
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(id).toMatch(uuidRegex);
  });

  it("should generate unique IDs", () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).not.toBe(id2);
  });

  it("should generate IDs with correct version (v4)", () => {
    const id = generateId();
    const parts = id.split("-");

    // Version should be 4 (UUID v4)
    expect(parts[2][0]).toBe("4");
  });
});

describe("getCurrentTimestamp", () => {
  it("should return ISO 8601 timestamp", () => {
    const ts = getCurrentTimestamp();
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

    expect(ts).toMatch(iso8601Regex);
  });

  it("should return valid date", () => {
    const ts = getCurrentTimestamp();
    const date = new Date(ts);

    expect(date.toString()).not.toBe("Invalid Date");
  });

  it("should return current time (within 1 second)", () => {
    const before = Date.now();
    const ts = getCurrentTimestamp();
    const after = Date.now();

    const tsTime = new Date(ts).getTime();

    expect(tsTime).toBeGreaterThanOrEqual(before);
    expect(tsTime).toBeLessThanOrEqual(after);
  });

  it("should return UTC timezone", () => {
    const ts = getCurrentTimestamp();

    expect(ts).toMatch(/Z$/); // Should end with Z (UTC)
  });
});

describe("Edge Cases", () => {
  it("should handle empty object", () => {
    const input = {};
    const output = normalizeRecord(input, "toSupabase");

    expect(output).toEqual({});
  });

  it("should handle null values", () => {
    const input = {
      nama: null,
      deskripsi: null,
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.nama).toBeNull();
    expect(output.deskripsi).toBeNull();
  });

  it("should handle undefined values", () => {
    const input = {
      nama: "Test",
      deskripsi: undefined,
    };

    const output = normalizeRecord(input, "toSupabase");

    expect(output.nama).toBe("Test");
    expect(output.deskripsi).toBeUndefined();
  });

  it("should handle mixed data types", () => {
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
