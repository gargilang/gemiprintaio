/**
 * Test override formula bagi hasil / bonus agar mengikuti metrik periode aktif.
 */

import type { FormulaDefinition } from "@/lib/ast/types";
import type { BusinessActor } from "@/lib/services/business-actor-service";
import { applyPeriodScopedFormulaOverrides } from "@/lib/services/formula-service";

const actorGemi: BusinessActor = {
  id: "actor-gemi",
  display_name: "Gemi",
  role_code: "OWNER",
  display_order: 1,
  is_active: 1,
  notes: null,
  profit_share_percent: 50,
  cash_advance_categories: null,
  keperluan_keyword: null,
  bonus_percent: null,
  bonus_source_formula_key: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const actorSuri: BusinessActor = {
  id: "actor-suri",
  display_name: "Suri",
  role_code: "OWNER",
  display_order: 2,
  is_active: 1,
  notes: null,
  profit_share_percent: 50,
  cash_advance_categories: null,
  keperluan_keyword: null,
  bonus_percent: 10,
  bonus_source_formula_key: "omzet",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const bagiHasilGemi: FormulaDefinition = {
  id: "f1",
  name: "Bagi Hasil Gemi",
  column: "P",
  dbColumn: "bagi_hasil_gemi",
  formulaKey: "bagi_hasil_gemi",
  actorId: "actor-gemi",
  formulaGroup: "profit_share",
  ast: { type: "literal", value: 0 },
  enabled: true,
  isSystem: false,
  displayOrder: 1,
  description: "",
};

const bagiHasilSuri: FormulaDefinition = {
  ...bagiHasilGemi,
  id: "f2",
  name: "Bagi Hasil Suri",
  column: "Q",
  dbColumn: "bagi_hasil_suri",
  formulaKey: "bagi_hasil_suri",
  actorId: "actor-suri",
};

const bonusSuri: FormulaDefinition = {
  id: "f3",
  name: "Bonus Suri",
  column: "R",
  dbColumn: "bonus_suri",
  formulaKey: "bonus_suri",
  actorId: "actor-suri",
  formulaGroup: "bonus",
  ast: { type: "literal", value: 0 },
  enabled: true,
  isSystem: false,
  displayOrder: 2,
  description: "",
};

describe("applyPeriodScopedFormulaOverrides", () => {
  it("menghitung ulang bagi hasil dari laba_bersih periode (bukan kumulatif)", () => {
    const latestMap: Record<string, number> = {
      omzet: 99_999_999,
      laba_bersih: 99_999_999,
      bagi_hasil_gemi: 25_000_000,
      bagi_hasil_suri: 25_000_000,
    };

    applyPeriodScopedFormulaOverrides(
      latestMap,
      [actorGemi, actorSuri],
      [bagiHasilGemi, bagiHasilSuri, bonusSuri],
      { omzet: 0, biaya_operasional: 0, biaya_bahan: 0, laba_bersih: 0 }
    );

    expect(latestMap.laba_bersih).toBe(0);
    expect(latestMap.bagi_hasil_gemi).toBe(0);
    expect(latestMap.bagi_hasil_suri).toBe(0);
    expect(latestMap.bonus_suri).toBe(0);
  });

  it("menghitung bagi hasil 50% dari laba periode aktif", () => {
    const latestMap: Record<string, number> = {
      bagi_hasil_gemi: 1,
      bagi_hasil_suri: 1,
    };

    applyPeriodScopedFormulaOverrides(
      latestMap,
      [actorGemi, actorSuri],
      [bagiHasilGemi, bagiHasilSuri],
      { omzet: 10_000_000, biaya_operasional: 2_000_000, biaya_bahan: 3_000_000, laba_bersih: 5_000_000 }
    );

    expect(latestMap.bagi_hasil_gemi).toBe(2_500_000);
    expect(latestMap.bagi_hasil_suri).toBe(2_500_000);
  });

  it("menghitung bonus dari omzet periode", () => {
    const latestMap: Record<string, number> = { bonus_suri: 999 };

    applyPeriodScopedFormulaOverrides(
      latestMap,
      [actorSuri],
      [bonusSuri],
      { omzet: 8_000_000, biaya_operasional: 0, biaya_bahan: 0, laba_bersih: 8_000_000 }
    );

    expect(latestMap.bonus_suri).toBe(800_000);
  });

  it("tidak mengubah map bila periodMetrics null (tampilan historis)", () => {
    const latestMap: Record<string, number> = { bagi_hasil_gemi: 25_000 };

    applyPeriodScopedFormulaOverrides(
      latestMap,
      [actorGemi],
      [bagiHasilGemi],
      null
    );

    expect(latestMap.bagi_hasil_gemi).toBe(25_000);
  });
});
