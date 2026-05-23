/**
 * Tests untuk perhitungan PPN. Sumber kebenaran: rumus harus konsisten antara
 * TS (offline/Tauri) dan Postgres function `public.hitung_ppn`. Pembulatan
 * dipaksa ke 2 desimal dengan half-up untuk match Postgres ROUND().
 */
import {
  hitungPpn,
  formatNsfpString,
  formatNpwp,
  isValidNpwp,
} from "../ppn-helpers";

describe("hitungPpn — EKSKLUSIF", () => {
  test("DPP polos × 11% = total + PPN", () => {
    const r = hitungPpn(1_000_000, 11, "EKSKLUSIF");
    expect(r.dpp).toBe(1_000_000);
    expect(r.ppn).toBe(110_000);
    expect(r.total).toBe(1_110_000);
  });

  test("DPP yang menghasilkan PPN pecahan rupiah dibulatkan ke 2 desimal", () => {
    // 333.333 × 11% = 36666.63 — DJP biasanya pakai pembulatan rupiah, tapi
    // kita simpan 2 desimal untuk avoid drift; UI yang format ke rupiah.
    const r = hitungPpn(333_333, 11, "EKSKLUSIF");
    expect(r.dpp).toBe(333_333);
    expect(r.ppn).toBe(36_666.63);
    expect(r.total).toBe(369_999.63);
  });

  test("tarif 0 atau amount 0 → tidak ada PPN", () => {
    expect(hitungPpn(0, 11, "EKSKLUSIF")).toEqual({ dpp: 0, ppn: 0, total: 0 });
    expect(hitungPpn(100_000, 0, "EKSKLUSIF")).toEqual({
      dpp: 100_000,
      ppn: 0,
      total: 100_000,
    });
  });

  test("tarif 12% (proyeksi UU HPP) tetap konsisten", () => {
    const r = hitungPpn(500_000, 12, "EKSKLUSIF");
    expect(r.dpp).toBe(500_000);
    expect(r.ppn).toBe(60_000);
    expect(r.total).toBe(560_000);
  });
});

describe("hitungPpn — INKLUSIF", () => {
  test("Total inklusif × 11% → DPP yang konsisten", () => {
    // Total 1.110.000 dengan PPN 11% sudah masuk → DPP 1.000.000.
    const r = hitungPpn(1_110_000, 11, "INKLUSIF");
    expect(r.dpp).toBe(1_000_000);
    expect(r.ppn).toBe(110_000);
    expect(r.total).toBe(1_110_000);
  });

  test("Total round-trip: EKSKLUSIF total → INKLUSIF input → DPP sama", () => {
    const exclusive = hitungPpn(750_000, 11, "EKSKLUSIF");
    const inclusive = hitungPpn(exclusive.total, 11, "INKLUSIF");
    expect(inclusive.dpp).toBeCloseTo(750_000, 1);
    expect(inclusive.ppn).toBeCloseTo(82_500, 1);
  });

  test("Total kecil dengan tarif 11% — pembulatan tidak meleset > Rp 1", () => {
    // Total Rp 11.000 inklusif: DPP ≈ 9909.91, PPN ≈ 1090.09. Sum tetap 11k.
    const r = hitungPpn(11_000, 11, "INKLUSIF");
    expect(r.dpp + r.ppn).toBeCloseTo(11_000, 2);
  });
});

describe("formatNsfpString", () => {
  test("Padding 8 digit + format komposit", () => {
    expect(formatNsfpString("01", "25", "1")).toBe("010.000-25.00000001");
    expect(formatNsfpString("01", "25", "12345678")).toBe("010.000-25.12345678");
  });

  test("Komponen kosong → empty string", () => {
    expect(formatNsfpString(null, "25", "1")).toBe("");
    expect(formatNsfpString("01", null, "1")).toBe("");
    expect(formatNsfpString("01", "25", null)).toBe("");
  });
});

describe("NPWP helpers", () => {
  test("Format 15 digit standar", () => {
    expect(formatNpwp("123456789012345")).toBe("12.345.678.9-012.345");
  });

  test("Format 16 digit (NIK-based) — tampil polos", () => {
    expect(formatNpwp("1234567890123456")).toBe("1234567890123456");
  });

  test("Strip non-digit input lalu format", () => {
    expect(formatNpwp("12.345.678.9-012.345")).toBe("12.345.678.9-012.345");
  });

  test("Validasi panjang", () => {
    expect(isValidNpwp("123456789012345")).toBe(true);
    expect(isValidNpwp("1234567890123456")).toBe(true);
    expect(isValidNpwp("12345")).toBe(false);
    expect(isValidNpwp("")).toBe(false);
    expect(isValidNpwp(null)).toBe(false);
  });
});
