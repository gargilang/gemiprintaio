/**
 * Test service pinjaman karyawan (kasbon sebagai piutang).
 *
 * Inti akuntansi yang diuji:
 *   - Saldo pinjaman = Σ(TARIK) − Σ(POTONG_GAJI) − Σ(BAYAR_TUNAI).
 *   - TARIK   → posting keuangan PINJAMAN_KARYAWAN kredit (kas keluar) ber-[REF].
 *   - BAYAR_TUNAI → posting keuangan PINJAMAN_KARYAWAN debit (kas masuk) ber-[REF].
 *   - revert → hapus baris keuangan ber-[REF] + tandai pinjaman is_deleted.
 *   - Baris is_deleted TIDAK dihitung dalam saldo.
 *
 * Pola mock mengikuti src/lib/__tests__/return-service.test.ts.
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

const recalculateMock = jest.fn();
jest.mock("@/lib/services/finance-service", () => ({
  __esModule: true,
  recalculateCashbookIfAvailable: (...args: any[]) => recalculateMock(...args),
}));

const isDateInClosedPeriodMock = jest.fn();
jest.mock("@/lib/services/accounting-periods-service", () => ({
  __esModule: true,
  isDateInClosedPeriod: (...args: any[]) => isDateInClosedPeriodMock(...args),
}));

import {
  catatTarikPinjaman,
  bayarPinjamanTunai,
  hitungSaldoPinjaman,
  hitungSaldoPinjamanBatch,
  listPinjaman,
  revertPinjaman,
} from "../services/pinjaman-karyawan-service";

function seedActor(actorId: string) {
  mockTable("pegawai").set(actorId, {
    id: actorId,
    display_name: `Karyawan ${actorId}`,
    role_code: "KARYAWAN",
    is_active: 1,
  });
}

beforeEach(() => {
  resetMockDb();
  recalculateMock.mockReset();
  isDateInClosedPeriodMock.mockReset().mockResolvedValue(false);
});

describe("hitungSaldoPinjaman", () => {
  it("menghitung saldo = Σ TARIK − Σ POTONG_GAJI − Σ BAYAR_TUNAI", async () => {
    seedActor("a1");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 500000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p2", {
      id: "p2",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 300000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p3", {
      id: "p3",
      actor_id: "a1",
      jenis: "POTONG_GAJI",
      jumlah: 400000,
      is_deleted: 0,
    });
    const saldo = await hitungSaldoPinjaman("a1");
    expect(saldo).toBe(400000);
  });

  it("mengabaikan baris is_deleted", async () => {
    seedActor("a1");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 500000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p2", {
      id: "p2",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 999999,
      is_deleted: 1,
    });
    mockTable("pinjaman_karyawan").set("p3", {
      id: "p3",
      actor_id: "a1",
      jenis: "BAYAR_TUNAI",
      jumlah: 200000,
      is_deleted: 0,
    });
    const saldo = await hitungSaldoPinjaman("a1");
    expect(saldo).toBe(300000);
  });

  it("mengembalikan 0 saat tidak ada pinjaman", async () => {
    seedActor("a1");
    expect(await hitungSaldoPinjaman("a1")).toBe(0);
  });
});

describe("hitungSaldoPinjamanBatch", () => {
  it("mengagregasi saldo per actor dalam satu pass (hindari N+1)", async () => {
    seedActor("a1");
    seedActor("a2");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 500000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p2", {
      id: "p2",
      actor_id: "a1",
      jenis: "BAYAR_TUNAI",
      jumlah: 200000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p3", {
      id: "p3",
      actor_id: "a2",
      jenis: "TARIK",
      jumlah: 100000,
      is_deleted: 0,
    });
    // Baris is_deleted diabaikan.
    mockTable("pinjaman_karyawan").set("p4", {
      id: "p4",
      actor_id: "a2",
      jenis: "TARIK",
      jumlah: 999999,
      is_deleted: 1,
    });

    const map = await hitungSaldoPinjamanBatch(["a1", "a2"]);
    expect(map.get("a1")).toBe(300000);
    expect(map.get("a2")).toBe(100000);
  });

  it("actor tanpa baris dikembalikan saldo 0; array kosong → map kosong", async () => {
    seedActor("a1");
    const map = await hitungSaldoPinjamanBatch(["a1"]);
    expect(map.get("a1")).toBe(0);
    const kosong = await hitungSaldoPinjamanBatch([]);
    expect(kosong.size).toBe(0);
  });
});

describe("catatTarikPinjaman", () => {
  it("insert baris TARIK + posting keuangan PINJAMAN_KARYAWAN kredit ber-[REF]", async () => {
    seedActor("a1");
    const res = await catatTarikPinjaman({
      actorId: "a1",
      jumlah: 250000,
      tanggal: "2026-06-01",
      keterangan: "kasbon awal bulan",
      dibuatOleh: "user-1",
    });

    const pinjaman = mockTable("pinjaman_karyawan").get(res.id)!;
    expect(pinjaman.jenis).toBe("TARIK");
    expect(pinjaman.jumlah).toBe(250000);
    expect(pinjaman.actor_id).toBe("a1");

    const cashbook = Array.from(mockTable("keuangan").values());
    const entry = cashbook.find(
      (r) => r.kategori_transaksi === "PINJAMAN_KARYAWAN"
    );
    expect(entry).toBeDefined();
    expect(entry!.kredit).toBe(250000);
    expect(entry!.debit).toBe(0);
    expect(String(entry!.keperluan)).toContain(`[REF:pinjaman-${res.id}]`);
    // Baris keuangan ditautkan balik ke pinjaman.
    expect(pinjaman.keuangan_ref_id).toBe(entry!.id);
    // Saldo naik sebesar tarikan.
    expect(await hitungSaldoPinjaman("a1")).toBe(250000);
    expect(recalculateMock).toHaveBeenCalled();
  });

  it("menolak tanggal di periode tertutup", async () => {
    seedActor("a1");
    isDateInClosedPeriodMock.mockResolvedValue(true);
    await expect(
      catatTarikPinjaman({
        actorId: "a1",
        jumlah: 100000,
        tanggal: "2026-01-01",
      })
    ).rejects.toThrow(/periode/i);
  });
});

describe("bayarPinjamanTunai", () => {
  it("insert baris BAYAR_TUNAI + posting keuangan PINJAMAN_KARYAWAN debit (kas masuk)", async () => {
    seedActor("a1");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 500000,
      is_deleted: 0,
    });
    const res = await bayarPinjamanTunai({
      actorId: "a1",
      jumlah: 200000,
      tanggal: "2026-06-10",
      keterangan: "kembalikan kasbon",
      dibuatOleh: "user-1",
    });
    const pinjaman = mockTable("pinjaman_karyawan").get(res.id)!;
    expect(pinjaman.jenis).toBe("BAYAR_TUNAI");

    const entry = Array.from(mockTable("keuangan").values()).find(
      (r) => r.kategori_transaksi === "PINJAMAN_KARYAWAN" && r.debit === 200000
    );
    expect(entry).toBeDefined();
    expect(entry!.kredit).toBe(0);
    // Saldo turun: 500000 − 200000 = 300000.
    expect(await hitungSaldoPinjaman("a1")).toBe(300000);
  });
});

describe("revertPinjaman", () => {
  it("menghapus baris keuangan ber-[REF] dan menandai pinjaman is_deleted", async () => {
    seedActor("a1");
    const tarik = await catatTarikPinjaman({
      actorId: "a1",
      jumlah: 250000,
      tanggal: "2026-06-01",
    });
    expect(await hitungSaldoPinjaman("a1")).toBe(250000);

    await revertPinjaman(tarik.id);

    // Pinjaman ditandai terhapus.
    const pinjaman = mockTable("pinjaman_karyawan").get(tarik.id)!;
    expect(pinjaman.is_deleted).toBe(1);
    // Baris keuangan ber-[REF] hilang.
    const sisaRef = Array.from(mockTable("keuangan").values()).filter((r) =>
      String(r.keperluan).includes(`[REF:pinjaman-${tarik.id}]`)
    );
    expect(sisaRef.length).toBe(0);
    // Saldo kembali 0.
    expect(await hitungSaldoPinjaman("a1")).toBe(0);
  });
});

describe("listPinjaman", () => {
  it("memfilter per actor dan mengabaikan baris terhapus", async () => {
    seedActor("a1");
    seedActor("a2");
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 100000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p2", {
      id: "p2",
      actor_id: "a2",
      jenis: "TARIK",
      jumlah: 200000,
      is_deleted: 0,
    });
    mockTable("pinjaman_karyawan").set("p3", {
      id: "p3",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 999999,
      is_deleted: 1,
    });
    const list = await listPinjaman("a1");
    expect(list.map((r) => r.id).sort()).toEqual(["p1"]);
  });
});
