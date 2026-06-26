import {
  buildRingkasanPengurusCepat,
  extractMetrikKas,
  hitungBagiHasilCepat,
  sumGroupWithQuickMetrics,
} from "@/lib/finance-summary-cache";

describe("finance-summary-cache", () => {
  it("menyalin metrik kas negatif tanpa clamp", () => {
    expect(
      extractMetrikKas({
        kas: -7_000_000,
        modal_kas: -3_000_000,
        saldo_kasbon: 4_000_000,
      }),
    ).toEqual({
      kas: -7_000_000,
      modal_kas: -3_000_000,
      saldo_kasbon: 4_000_000,
    });
  });

  it("menghitung bagi hasil cepat dari laba terbaru termasuk saat rugi", () => {
    expect(hitungBagiHasilCepat(-2_500_000, 20)).toBe(-500_000);
  });

  it("mengganti nilai profit share dengan metrik cepat saat tersedia", () => {
    const columns = [
      { formulaKey: "bagi_hasil_andi", group: "profit_share" as const },
    ];
    const metrics = { bagi_hasil_andi: 125_000 };

    expect(
      sumGroupWithQuickMetrics(metrics, columns, "profit_share", {
        latestSystemMetrics: { laba_bersih: 1_000_000 },
        profitSharePercent: 30,
      }),
    ).toBe(300_000);
  });

  it("membuat fallback pengurus cepat dari laba bersih terbaru", () => {
    const summary = buildRingkasanPengurusCepat({
      actors: [
        {
          id: "actor-1",
          display_name: "Andi Owner",
          role_code: "OWNER",
          display_order: 2,
          profit_share_percent: 25,
        },
        {
          id: "actor-2",
          display_name: "Sari Kasir",
          role_code: "KASIR",
          display_order: 1,
          profit_share_percent: null,
        },
      ],
      roles: [{ role_code: "OWNER", role_label: "Pemilik" }],
      latestSystemMetrics: { laba_bersih: 2_000_000 },
    });

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      actorId: "actor-1",
      displayName: "Andi Owner",
      roleLabel: "Pemilik",
      profitSharePercent: 25,
      metrics: { bagi_hasil_andi_owner: 500_000 },
    });
  });
});
