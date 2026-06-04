import { normalizeRecord } from "../normalize-record";

describe("normalizeRecord boolean detection", () => {
  test("status_pembayaran enum string TIDAK dikonversi ke boolean", () => {
    const r = normalizeRecord({ status_pembayaran: "LUNAS" }, "toSupabase");
    expect(r.status_pembayaran).toBe("LUNAS");
  });

  test("enum integer status (roll_inventory_status) TIDAK jadi true/false", () => {
    const r = normalizeRecord({ roll_inventory_status: 1 }, "toSupabase");
    expect(r.roll_inventory_status).toBe(1);
  });

  test("void_status_kode (kode enum) TIDAK jadi boolean", () => {
    const r = normalizeRecord({ void_status_kode: 1 }, "toSupabase");
    expect(r.void_status_kode).toBe(1);
  });

  test("aktif_status tetap dikonversi ke boolean (genuine boolean)", () => {
    const r = normalizeRecord({ aktif_status: 1 }, "toSupabase");
    expect(r.aktif_status).toBe(true);
  });

  test("is_deleted tetap dikonversi ke boolean", () => {
    const r = normalizeRecord({ is_deleted: 0 }, "toSupabase");
    expect(r.is_deleted).toBe(false);
  });

  test("arah balik: boolean → 1/0 untuk SQLite (apa pun namanya)", () => {
    const r = normalizeRecord({ is_active: true, apa_saja: false }, "toSQLite");
    expect(r.is_active).toBe(1);
    expect(r.apa_saja).toBe(0);
  });
});
