/**
 * Cashbook AST behaviour for the MAKLON category.
 *
 * Maklon outflows are like SUPPLY: pure cash movement on `saldo`. They must
 * NOT bump `biaya_operasional` or `biaya_bahan` because the cost was already
 * booked as HPP at sale time, and double-counting would distort `laba_bersih`.
 *
 * This file isolates that invariant so a future formula refactor can't
 * silently break the maklon profitability calculation.
 */

import { evaluateDataset } from "../evaluator";
import { DEFAULT_FORMULAS } from "../defaults";
import type { InputRow, PartnerDefinition } from "../types";

const NO_PARTNERS: PartnerDefinition[] = [];

const formulas = DEFAULT_FORMULAS.map((f) => ({
  column: f.column,
  ast: f.ast,
}));

describe("Cashbook AST — MAKLON category", () => {
  test("MAKLON kredit reduces saldo but does not bump biaya_*", () => {
    const rows: InputRow[] = [
      // 1. Customer pays Rp 1.000.000 for a sale (full amount).
      { C: "OMZET", D: 1_000_000, E: 0, F: "INV-001 [REF:sale-1]" },
      // 2. HPP booked for the maklon line: Rp 600.000 (= biaya subkontrak).
      //    Non-cash journal entry — saldo unchanged, biaya_bahan += 600k.
      { C: "HPP", D: 0, E: 600_000, F: "HPP INV-001 [REF:sale-1]" },
      // 3. Cash payout to the subcontractor partner: Rp 600.000.
      //    Real cash out — saldo -= 600k, biaya_* unchanged.
      { C: "MAKLON", D: 0, E: 600_000, F: "Maklon INV-001 - Vendor X [REF:mk-1]" },
    ];

    const out = evaluateDataset(rows, formulas, NO_PARTNERS);

    // Row 0: OMZET — saldo +1m, omzet +1m, biaya untouched, laba = 1m.
    expect(out[0].J).toBe(1_000_000); // saldo
    expect(out[0].G).toBe(1_000_000); // omzet
    expect(out[0].H).toBe(0); // biaya_operasional
    expect(out[0].I).toBe(0); // biaya_bahan
    expect(out[0].K).toBe(1_000_000); // laba_bersih

    // Row 1: HPP — saldo unchanged (non-cash), biaya_bahan +600k, laba = 400k.
    expect(out[1].J).toBe(1_000_000); // saldo: HPP excluded
    expect(out[1].I).toBe(600_000); // biaya_bahan accumulator
    expect(out[1].H).toBe(0); // biaya_operasional unchanged
    expect(out[1].K).toBe(400_000); // 1m - (0 + 600k)

    // Row 2: MAKLON kredit — saldo -600k, biaya_* untouched, laba unchanged.
    // The cost was already booked via HPP at row 1, so MAKLON must NOT bump
    // biaya_bahan (would be a 1.2m biaya total → 200k loss instead of 400k profit).
    expect(out[2].J).toBe(400_000); // 1m - 600k cash out
    expect(out[2].I).toBe(600_000); // biaya_bahan unchanged
    expect(out[2].H).toBe(0); // biaya_operasional unchanged
    expect(out[2].K).toBe(400_000); // laba_bersih preserved
  });

  test("MAKLON NET30 path (no immediate cash entry) keeps saldo high", () => {
    // When metode_bayar_vendor is NET30, the system writes a hutang_pembelian
    // row instead of a keuangan row — there is NO MAKLON entry in the
    // cashbook until the debt is paid off. Until then saldo should reflect
    // only the customer cash-in, and laba_bersih should correctly account
    // for the HPP we already booked.
    const rows: InputRow[] = [
      { C: "OMZET", D: 1_000_000, E: 0, F: "INV-002 [REF:sale-2]" },
      { C: "HPP", D: 0, E: 600_000, F: "HPP INV-002 [REF:sale-2]" },
      // No MAKLON kredit yet — the vendor PO is sitting in hutang_pembelian.
    ];

    const out = evaluateDataset(rows, formulas, NO_PARTNERS);

    // Saldo high because vendor hasn't been paid yet.
    expect(out[1].J).toBe(1_000_000);
    // Laba bersih already correct — HPP booked at sale time captures the cost.
    expect(out[1].K).toBe(400_000);

    // When the user pays the maklon hutang later, payDebt inserts a MAKLON
    // kredit; saldo will drop accordingly. Simulate the payoff:
    const afterPayoff: InputRow[] = [
      ...rows,
      { C: "MAKLON", D: 0, E: 600_000, F: "Pembayaran Hutang MAKLON-INV-002 [REF:mk-2]" },
    ];
    const out2 = evaluateDataset(afterPayoff, formulas, NO_PARTNERS);
    expect(out2[2].J).toBe(400_000); // saldo finally reflects the cash out
    expect(out2[2].K).toBe(400_000); // laba_bersih unchanged across the payoff
  });
});
