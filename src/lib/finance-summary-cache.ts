import { slugifyActorName } from "@/lib/slug-utils";

export const PENGGAJIAN_METRIK_KAS_CACHE_KEY = "penggajian-metrik-kas";

export type MetrikKas = {
  kas: number;
  modal_kas: number;
  saldo_kasbon: number;
};

export type MetrikSistemKeuangan = MetrikKas & {
  omzet?: number;
  biaya_operasional?: number;
  biaya_bahan?: number;
  saldo?: number;
  laba_bersih: number;
};

type KolomRingkasan = {
  formulaKey: string;
  group: string;
};

export type KolomRingkasanPengurus = {
  formulaKey: string;
  label: string;
  group: "profit_share" | "cash_advance" | "bonus" | "custom" | "summary";
};

export type BarisRingkasanPengurus = {
  actorId: string | null;
  displayName: string;
  roleLabel: string;
  profitSharePercent: number | null;
  metrics: Record<string, number | null>;
  displayOrder: number;
  isGlobal: boolean;
};

export type RingkasanPengurusCepat = {
  month: string | null;
  columns: KolomRingkasanPengurus[];
  rows: BarisRingkasanPengurus[];
  legacyOrphanFormulas: number;
};

type ActorCepat = {
  id: string;
  display_name: string;
  role_code: string;
  display_order?: number | null;
  profit_share_percent: number | null;
};

type RoleCepat = {
  role_code: string;
  role_label: string;
};

function angka(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function extractMetrikKas(
  metrics: Partial<MetrikKas> | null | undefined,
): MetrikKas | null {
  if (!metrics) return null;
  return {
    kas: angka(metrics.kas),
    modal_kas: angka(metrics.modal_kas),
    saldo_kasbon: angka(metrics.saldo_kasbon),
  };
}

export function hitungBagiHasilCepat(
  labaBersih: number,
  profitSharePercent: number,
): number {
  return Math.round((angka(labaBersih) * angka(profitSharePercent)) / 100);
}

export function sumGroupWithQuickMetrics(
  metrics: Record<string, number | null>,
  columns: KolomRingkasan[],
  group: string,
  options?: {
    latestSystemMetrics?: Pick<MetrikSistemKeuangan, "laba_bersih"> | null;
    profitSharePercent?: number | null;
  },
): number | null {
  const keys = columns.filter((c) => c.group === group).map((c) => c.formulaKey);
  if (keys.length === 0) return null;

  const hasAny = keys.some((k) => metrics[k] !== undefined && metrics[k] !== null);
  if (!hasAny) return null;

  if (
    group === "profit_share" &&
    options?.latestSystemMetrics &&
    options.profitSharePercent !== null &&
    options.profitSharePercent !== undefined
  ) {
    return hitungBagiHasilCepat(
      options.latestSystemMetrics.laba_bersih,
      options.profitSharePercent,
    );
  }

  return keys.reduce((sum, k) => sum + (metrics[k] ?? 0), 0);
}

export function buildRingkasanPengurusCepat({
  actors,
  roles,
  latestSystemMetrics,
}: {
  actors: ActorCepat[];
  roles: RoleCepat[];
  latestSystemMetrics: Pick<MetrikSistemKeuangan, "laba_bersih">;
}): RingkasanPengurusCepat {
  const roleLabelByCode = new Map(roles.map((r) => [r.role_code, r.role_label]));
  const columns: KolomRingkasanPengurus[] = [];
  const rows: BarisRingkasanPengurus[] = [];

  for (const actor of actors) {
    if (actor.profit_share_percent === null) continue;

    const percent = Number(actor.profit_share_percent);
    const formulaKey = `bagi_hasil_${slugifyActorName(actor.display_name)}`;
    columns.push({
      formulaKey,
      label: `Bagi Hasil ${actor.display_name}`,
      group: "profit_share",
    });
    rows.push({
      actorId: actor.id,
      displayName: actor.display_name,
      roleLabel: roleLabelByCode.get(actor.role_code) ?? actor.role_code,
      profitSharePercent: percent,
      metrics: {
        [formulaKey]: hitungBagiHasilCepat(
          latestSystemMetrics.laba_bersih,
          percent,
        ),
      },
      displayOrder: Number(actor.display_order ?? 0),
      isGlobal: false,
    });
  }

  rows.sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    month: null,
    columns,
    rows,
    legacyOrphanFormulas: 0,
  };
}
