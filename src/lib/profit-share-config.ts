/**
 * Konfigurasi bagi hasil — dipakai UI Keuangan dan logika hitung ulang buku kas.
 */

import { lookupFinanceSlotLabel } from "@/lib/finance-slot-labels";

export type ProfitFormula = "third_minus_kasbon" | "incremental_investor";

export type ProfitShareSlotDef = {
  sourceColumn: string;
  kasbonColumn: string | null;
  pribadiKategori: string | null;
  defaultFormula: ProfitFormula;
  label: string;
};

export const PROFIT_SHARE_SLOTS: ProfitShareSlotDef[] = [
  {
    sourceColumn: "bagi_hasil_anwar",
    kasbonColumn: "kasbon_anwar",
    pribadiKategori: "PRIBADI-A",
    defaultFormula: "third_minus_kasbon",
    label: lookupFinanceSlotLabel("bagi_hasil_anwar"),
  },
  {
    sourceColumn: "bagi_hasil_suri",
    kasbonColumn: "kasbon_suri",
    pribadiKategori: "PRIBADI-S",
    defaultFormula: "third_minus_kasbon",
    label: lookupFinanceSlotLabel("bagi_hasil_suri"),
  },
  {
    sourceColumn: "bagi_hasil_gemi",
    kasbonColumn: null,
    pribadiKategori: null,
    defaultFormula: "incremental_investor",
    label: lookupFinanceSlotLabel("bagi_hasil_gemi"),
  },
];

export type ProfitSharePartnerRuntime = {
  participantId: string | null;
  displayName: string;
  sourceColumn: string;
  formula: ProfitFormula;
  shareDivisor: number;
  kasbonColumn: string | null;
  pribadiKategori: string | null;
};

export const PROFIT_FORMULA_LABELS: Record<ProfitFormula, string> = {
  third_minus_kasbon: "Bagian laba ÷ pembagian − kasbon",
  incremental_investor: "Akumulasi kenaikan laba ÷ pembagian + transaksi investor",
};

export function slotForSourceColumn(
  sourceColumn: string
): ProfitShareSlotDef | undefined {
  return PROFIT_SHARE_SLOTS.find((s) => s.sourceColumn === sourceColumn);
}

export function defaultProfitSharePartners(): ProfitSharePartnerRuntime[] {
  return PROFIT_SHARE_SLOTS.map((slot) => ({
    participantId: null,
    displayName: slot.label,
    sourceColumn: slot.sourceColumn,
    formula: slot.defaultFormula,
    shareDivisor: 3,
    kasbonColumn: slot.kasbonColumn,
    pribadiKategori: slot.pribadiKategori,
  }));
}

export type ProfitShareParticipantRow = {
  id: string;
  display_name: string;
  role_type: string;
  profit_formula?: ProfitFormula | null;
  share_divisor?: number | null;
  bagi_hasil_column?: string | null;
  kasbon_column?: string | null;
  pribadi_kategori?: string | null;
};

export type ProfitShareMappingRow = {
  id?: string;
  metric_group: string;
  source_column: string;
  participant_id?: string | null;
  is_active?: number;
};

export function buildProfitSharePartnersFromConfig(
  participants: ProfitShareParticipantRow[],
  mappings: ProfitShareMappingRow[]
): ProfitSharePartnerRuntime[] {
  const activeMappings = mappings.filter(
    (m) => m.metric_group === "profit_share"
  );

  const partners: ProfitSharePartnerRuntime[] = [];

  for (const mapping of activeMappings) {
    const slot = slotForSourceColumn(mapping.source_column);
    if (!slot) continue;

    const participant = mapping.participant_id
      ? participants.find((p) => p.id === mapping.participant_id)
      : undefined;

    if (!participant || participant.role_type !== "profit_share") continue;

    const formula =
      (participant.profit_formula as ProfitFormula | null) ||
      slot.defaultFormula;
    const shareDivisor =
      participant.share_divisor && participant.share_divisor > 0
        ? participant.share_divisor
        : 3;

    partners.push({
      participantId: participant.id,
      displayName: participant.display_name,
      sourceColumn: slot.sourceColumn,
      formula,
      shareDivisor,
      kasbonColumn:
        participant.kasbon_column ?? slot.kasbonColumn,
      pribadiKategori:
        participant.pribadi_kategori ?? slot.pribadiKategori,
    });
  }

  if (partners.length > 0) {
    return partners.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "id")
    );
  }

  return defaultProfitSharePartners();
}

export function findAvailableProfitShareSlot(
  mappings: ProfitShareMappingRow[]
): ProfitShareSlotDef | null {
  const used = new Set(
    mappings
      .filter((m) => m.metric_group === "profit_share")
      .map((m) => m.source_column)
  );
  return PROFIT_SHARE_SLOTS.find((s) => !used.has(s.sourceColumn)) ?? null;
}

/** Slot yang punya baris mapping tapi belum terhubung ke orang */
export function findOrphanProfitShareSlot(
  mappings: ProfitShareMappingRow[]
): ProfitShareSlotDef | null {
  for (const slot of PROFIT_SHARE_SLOTS) {
    const mapping = mappings.find(
      (m) =>
        m.metric_group === "profit_share" &&
        m.source_column === slot.sourceColumn
    );
    if (mapping && !mapping.participant_id) return slot;
  }
  return null;
}

export function resolveProfitShareSlotForNewPartner(
  mappings: ProfitShareMappingRow[],
  preferredSourceColumn?: string
): ProfitShareSlotDef | null {
  if (preferredSourceColumn) {
    const preferred = slotForSourceColumn(preferredSourceColumn);
    if (preferred) {
      const mapping = mappings.find(
        (m) =>
          m.metric_group === "profit_share" &&
          m.source_column === preferred.sourceColumn
      );
      if (!mapping || !mapping.participant_id) return preferred;
    }
  }
  return (
    findAvailableProfitShareSlot(mappings) ??
    findOrphanProfitShareSlot(mappings)
  );
}
