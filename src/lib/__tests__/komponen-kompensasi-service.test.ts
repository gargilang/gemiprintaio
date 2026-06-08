/**
 * Test service komponen kompensasi.
 *
 * Komponen kompensasi mendefinisikan apa yang membentuk gaji seorang karyawan:
 *   - TETAP  → nominal tetap per periode (mis. Gaji Pokok Rp 3jt).
 *   - PERSEN → persen × nilai sumber (mis. Komisi 5% dari omzet periode).
 *
 * Inti yang diuji: hitungBrutoPeriode menjumlahkan semua komponen aktif,
 * dengan PERSEN dievaluasi terhadap nilai sumber yang dipasok caller.
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
  };
});

import {
  listKomponen,
  createKomponen,
  updateKomponen,
  deleteKomponen,
  hitungBrutoPeriode,
} from "../services/komponen-kompensasi-service";

beforeEach(() => {
  resetMockDb();
});

describe("createKomponen (validasi)", () => {
  it("TETAP wajib nominal > 0", async () => {
    await expect(
      createKomponen({
        actor_id: "a1",
        tipe: "GAJI_POKOK",
        nama: "Gaji Pokok",
        metode: "TETAP",
        nominal: 0,
      })
    ).rejects.toThrow(/nominal/i);
  });

  it("PERSEN wajib persen + sumber_formula_key", async () => {
    await expect(
      createKomponen({
        actor_id: "a1",
        tipe: "KOMISI",
        nama: "Komisi",
        metode: "PERSEN",
        persen: 5,
      })
    ).rejects.toThrow(/sumber/i);
  });

  it("menyimpan komponen TETAP yang valid", async () => {
    const res = await createKomponen({
      actor_id: "a1",
      tipe: "GAJI_POKOK",
      nama: "Gaji Pokok",
      metode: "TETAP",
      nominal: 3000000,
    });
    const row = mockTable("komponen_kompensasi").get(res.id)!;
    expect(row.nominal).toBe(3000000);
    expect(row.aktif_status).toBe(1);
  });
});

describe("hitungBrutoPeriode", () => {
  it("menjumlahkan GAJI_POKOK TETAP + KOMISI PERSEN dari omzet", async () => {
    // GAJI_POKOK 3jt + KOMISI 5% × omzet 20jt = 3jt + 1jt = 4jt.
    mockTable("komponen_kompensasi").set("k1", {
      id: "k1",
      actor_id: "a1",
      tipe: "GAJI_POKOK",
      nama: "Gaji Pokok",
      metode: "TETAP",
      nominal: 3000000,
      persen: 0,
      sumber_formula_key: null,
      aktif_status: 1,
      is_deleted: 0,
    });
    mockTable("komponen_kompensasi").set("k2", {
      id: "k2",
      actor_id: "a1",
      tipe: "KOMISI",
      nama: "Komisi Penjualan",
      metode: "PERSEN",
      nominal: 0,
      persen: 5,
      sumber_formula_key: "omzet",
      aktif_status: 1,
      is_deleted: 0,
    });
    const hasil = await hitungBrutoPeriode("a1", { omzet: 20000000 });
    expect(hasil.bruto).toBe(4000000);
    expect(hasil.rincian).toHaveLength(2);
    const komisi = hasil.rincian.find((r) => r.tipe === "KOMISI")!;
    expect(komisi.nilai).toBe(1000000);
  });

  it("mengabaikan komponen nonaktif dan terhapus", async () => {
    mockTable("komponen_kompensasi").set("k1", {
      id: "k1",
      actor_id: "a1",
      tipe: "GAJI_POKOK",
      nama: "Gaji Pokok",
      metode: "TETAP",
      nominal: 3000000,
      aktif_status: 1,
      is_deleted: 0,
    });
    mockTable("komponen_kompensasi").set("k2", {
      id: "k2",
      actor_id: "a1",
      tipe: "TUNJANGAN",
      nama: "Tunjangan lama",
      metode: "TETAP",
      nominal: 500000,
      aktif_status: 0,
      is_deleted: 0,
    });
    mockTable("komponen_kompensasi").set("k3", {
      id: "k3",
      actor_id: "a1",
      tipe: "BONUS",
      nama: "Bonus dihapus",
      metode: "TETAP",
      nominal: 999999,
      aktif_status: 1,
      is_deleted: 1,
    });
    const hasil = await hitungBrutoPeriode("a1", {});
    expect(hasil.bruto).toBe(3000000);
    expect(hasil.rincian).toHaveLength(1);
  });

  it("PERSEN dari sumber yang tidak ada dihitung 0", async () => {
    mockTable("komponen_kompensasi").set("k1", {
      id: "k1",
      actor_id: "a1",
      tipe: "KOMISI",
      nama: "Komisi",
      metode: "PERSEN",
      persen: 10,
      sumber_formula_key: "laba",
      aktif_status: 1,
      is_deleted: 0,
    });
    const hasil = await hitungBrutoPeriode("a1", { omzet: 5000000 });
    expect(hasil.bruto).toBe(0);
  });
});

describe("updateKomponen + deleteKomponen", () => {
  it("update menyimpan patch", async () => {
    const created = await createKomponen({
      actor_id: "a1",
      tipe: "GAJI_POKOK",
      nama: "Gaji Pokok",
      metode: "TETAP",
      nominal: 3000000,
    });
    await updateKomponen(created.id, { nominal: 3500000 });
    expect(mockTable("komponen_kompensasi").get(created.id)!.nominal).toBe(
      3500000
    );
  });

  it("delete soft menandai is_deleted dan tersembunyi dari list", async () => {
    const created = await createKomponen({
      actor_id: "a1",
      tipe: "TUNJANGAN",
      nama: "Transport",
      metode: "TETAP",
      nominal: 500000,
    });
    await deleteKomponen(created.id);
    expect(mockTable("komponen_kompensasi").get(created.id)!.is_deleted).toBe(1);
    const list = await listKomponen("a1");
    expect(list).toHaveLength(0);
  });
});
