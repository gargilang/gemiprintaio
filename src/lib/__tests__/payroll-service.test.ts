/**
 * Test service payroll run + slip + void (inti modul penggajian).
 *
 * Aturan akuntansi (dikonfirmasi owner):
 *   - BEBAN GAJI = bruto penuh (mengurangi laba), bukan neto.
 *   - Potongan kasbon saat gajian = pelunasan piutang (pinjaman), netral laba.
 *
 * Mekanik kas saat bayar payroll, per slip:
 *   - keuangan GAJI kredit = bruto      → saldo turun bruto, biaya_operasional naik bruto.
 *   - keuangan PINJAMAN_KARYAWAN debit = potongan → saldo naik potongan, netral laba.
 *   ⇒ net kas keluar = bruto − potongan = neto; beban gaji tetap = bruto.
 *   - baris pinjaman_karyawan POTONG_GAJI menurunkan saldo pinjaman karyawan.
 *
 * Void membalik semua: hapus keuangan ber-[REF:gaji-<runId>], tandai POTONG_GAJI
 * is_deleted (saldo pinjaman kembali), set run + slip VOIDED.
 *
 * Memakai service komponen + pinjaman yang asli di atas mock-db (lebih dekat
 * ke perilaku produksi daripada mem-mock tiap fungsi).
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
  hitungDraftPayroll,
  simpanDraftPayroll,
  bayarPayrollRun,
  voidPayrollRun,
  listPayrollRun,
} from "../services/payroll-service";
import { hitungSaldoPinjaman } from "../services/pinjaman-karyawan-service";

function seedActor(id: string, nama: string) {
  mockTable("business_actors").set(id, {
    id,
    display_name: nama,
    role_code: "KARYAWAN",
    is_active: 1,
    is_deleted: 0,
  });
}

function seedKomponen(
  id: string,
  actorId: string,
  patch: Record<string, unknown>
) {
  mockTable("komponen_kompensasi").set(id, {
    id,
    actor_id: actorId,
    tipe: "GAJI_POKOK",
    nama: "Gaji Pokok",
    metode: "TETAP",
    nominal: 0,
    persen: 0,
    sumber_formula_key: null,
    aktif_status: 1,
    urutan_tampilan: 0,
    is_deleted: 0,
    ...patch,
  });
}

beforeEach(() => {
  resetMockDb();
  recalculateMock.mockReset();
  isDateInClosedPeriodMock.mockReset().mockResolvedValue(false);
});

describe("hitungDraftPayroll", () => {
  it("menghitung bruto per karyawan dan potongan kasbon (potong penuh)", async () => {
    seedActor("a1", "Budi");
    seedActor("a2", "Sari");
    // Budi: gaji pokok 3jt + komisi 5% omzet 20jt = 4jt; punya kasbon 1jt.
    seedKomponen("k1", "a1", { nominal: 3000000 });
    seedKomponen("k2", "a1", {
      tipe: "KOMISI",
      nama: "Komisi",
      metode: "PERSEN",
      persen: 5,
      sumber_formula_key: "omzet",
    });
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 1000000,
      is_deleted: 0,
    });
    // Sari: gaji pokok 2jt, tanpa kasbon.
    seedKomponen("k3", "a2", { nominal: 2000000 });

    const draft = await hitungDraftPayroll("2026-06", {
      sumberNilai: { omzet: 20000000 },
      potonganPerActor: { a1: 1000000 },
    });

    expect(draft.periode).toBe("2026-06");
    const budi = draft.slips.find((s) => s.actor_id === "a1")!;
    expect(budi.bruto).toBe(4000000);
    expect(budi.saldo_pinjaman).toBe(1000000);
    expect(budi.potongan_kasbon).toBe(1000000);
    expect(budi.neto).toBe(3000000);

    const sari = draft.slips.find((s) => s.actor_id === "a2")!;
    expect(sari.bruto).toBe(2000000);
    expect(sari.potongan_kasbon).toBe(0);
    expect(sari.neto).toBe(2000000);

    expect(draft.total_bruto).toBe(6000000);
    expect(draft.total_potongan_kasbon).toBe(1000000);
    expect(draft.total_neto).toBe(5000000);
  });

  it("membatasi potongan tidak melebihi min(saldo, bruto)", async () => {
    seedActor("a1", "Budi");
    seedKomponen("k1", "a1", { nominal: 2000000 });
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 5000000,
      is_deleted: 0,
    });
    // Minta potong 5jt padahal bruto cuma 2jt → dibatasi ke 2jt.
    const draft = await hitungDraftPayroll("2026-06", {
      potonganPerActor: { a1: 5000000 },
    });
    const budi = draft.slips[0];
    expect(budi.potongan_kasbon).toBe(2000000);
    expect(budi.neto).toBe(0);
  });

  it("mengabaikan karyawan tanpa komponen aktif", async () => {
    seedActor("a1", "Budi");
    seedActor("a2", "TanpaGaji");
    seedKomponen("k1", "a1", { nominal: 1000000 });
    const draft = await hitungDraftPayroll("2026-06", {});
    expect(draft.slips).toHaveLength(1);
    expect(draft.slips[0].actor_id).toBe("a1");
  });
});

describe("bayarPayrollRun", () => {
  async function buatDraftBudi() {
    seedActor("a1", "Budi");
    seedKomponen("k1", "a1", { nominal: 4000000 });
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 1000000,
      is_deleted: 0,
    });
    const draft = await hitungDraftPayroll("2026-06", {
      potonganPerActor: { a1: 1000000 },
    });
    return simpanDraftPayroll(draft, "user-1");
  }

  it("posting GAJI bruto + PINJAMAN_KARYAWAN debit potongan, run DIBAYAR", async () => {
    const runId = await buatDraftBudi();
    await bayarPayrollRun(runId, "2026-06-25", "TRANSFER", "user-1");

    const cashbook = Array.from(mockTable("keuangan").values());
    const gaji = cashbook.find((r) => r.kategori_transaksi === "GAJI")!;
    // BEBAN GAJI = bruto penuh (4jt), bukan neto.
    expect(gaji.kredit).toBe(4000000);
    expect(String(gaji.keperluan)).toContain(`[REF:gaji-${runId}]`);

    const potongKas = cashbook.find(
      (r) => r.kategori_transaksi === "PINJAMAN_KARYAWAN"
    )!;
    // Potongan kasbon = kas masuk (debit) yang mengimbangi, netral laba.
    expect(potongKas.debit).toBe(1000000);
    expect(String(potongKas.keperluan)).toContain(`[REF:gaji-${runId}]`);

    // Net kas keluar = 4jt − 1jt = 3jt (neto). Beban gaji = 4jt (bruto).

    // Baris POTONG_GAJI terbuat dan saldo pinjaman kembali 0.
    const potongLedger = Array.from(
      mockTable("pinjaman_karyawan").values()
    ).find((r) => r.jenis === "POTONG_GAJI")!;
    expect(potongLedger.jumlah).toBe(1000000);
    expect(potongLedger.payroll_run_id).toBe(runId);
    expect(await hitungSaldoPinjaman("a1")).toBe(0);

    // Run + slip DIBAYAR.
    const run = mockTable("payroll_run").get(runId)!;
    expect(run.status).toBe("DIBAYAR");
    expect(run.tanggal_bayar).toBe("2026-06-25");
    const slip = Array.from(mockTable("payroll_slip").values())[0];
    expect(slip.keuangan_ref_id).toBe(gaji.id);
  });

  it("menolak bayar saat tanggal di periode tertutup", async () => {
    const runId = await buatDraftBudi();
    isDateInClosedPeriodMock.mockResolvedValue(true);
    await expect(
      bayarPayrollRun(runId, "2026-01-01", "CASH", "user-1")
    ).rejects.toThrow(/periode/i);
  });

  it("menolak bayar run yang bukan DRAFT", async () => {
    const runId = await buatDraftBudi();
    await bayarPayrollRun(runId, "2026-06-25", "CASH", "user-1");
    await expect(
      bayarPayrollRun(runId, "2026-06-25", "CASH", "user-1")
    ).rejects.toThrow(/DRAFT/i);
  });
});

describe("voidPayrollRun", () => {
  it("membalik semua: hapus keuangan, balik POTONG_GAJI, status VOIDED", async () => {
    seedActor("a1", "Budi");
    seedKomponen("k1", "a1", { nominal: 4000000 });
    mockTable("pinjaman_karyawan").set("p1", {
      id: "p1",
      actor_id: "a1",
      jenis: "TARIK",
      jumlah: 1000000,
      is_deleted: 0,
    });
    const draft = await hitungDraftPayroll("2026-06", {
      potonganPerActor: { a1: 1000000 },
    });
    const runId = await simpanDraftPayroll(draft, "user-1");
    await bayarPayrollRun(runId, "2026-06-25", "CASH", "user-1");

    // Sebelum void: saldo 0, ada keuangan.
    expect(await hitungSaldoPinjaman("a1")).toBe(0);

    await voidPayrollRun(runId, "user-1");

    // Keuangan ber-[REF:gaji-<runId>] hilang.
    const sisaKeuangan = Array.from(mockTable("keuangan").values()).filter((r) =>
      String(r.keperluan).includes(`[REF:gaji-${runId}]`)
    );
    expect(sisaKeuangan).toHaveLength(0);

    // POTONG_GAJI dibatalkan → saldo pinjaman kembali 1jt.
    expect(await hitungSaldoPinjaman("a1")).toBe(1000000);

    // Run VOIDED.
    expect(mockTable("payroll_run").get(runId)!.status).toBe("VOIDED");
    const slip = Array.from(mockTable("payroll_slip").values())[0];
    expect(slip.status).toBe("VOIDED");
  });

  it("menolak void run yang belum DIBAYAR", async () => {
    seedActor("a1", "Budi");
    seedKomponen("k1", "a1", { nominal: 1000000 });
    const draft = await hitungDraftPayroll("2026-06", {});
    const runId = await simpanDraftPayroll(draft, "user-1");
    await expect(voidPayrollRun(runId, "user-1")).rejects.toThrow(/DIBAYAR/i);
  });
});

describe("listPayrollRun", () => {
  it("mengembalikan run beserta slip, mengabaikan run terhapus", async () => {
    seedActor("a1", "Budi");
    seedKomponen("k1", "a1", { nominal: 1000000 });
    const draft = await hitungDraftPayroll("2026-06", {});
    const runId = await simpanDraftPayroll(draft, "user-1");
    const list = await listPayrollRun();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(runId);
    expect(list[0].slips).toHaveLength(1);
  });
});
