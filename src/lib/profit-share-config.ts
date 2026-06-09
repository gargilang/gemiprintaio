/**
 * Profit-share configuration — slot structure generik, diisi dari DB.
 * Tidak ada lagi nama kolom legacy (bagi_hasil_anwar, kasbon_suri, dll).
 * Slot diisi dari finance_metric_mappings + finance_participants yang
 * diatur oleh pengguna melalui UI.
 */

import { lookupFinanceSlotLabel } from "@/lib/finance-slot-labels";

export type ProfitFormula = "third_minus_kasbon" | "incremental_investor" | "percentage_based";

export type ProfitShareSlotDef = {
  sourceColumn: string;
  kasbonColumn: string | null;
  pribadiKategori: string | null;
  defaultFormula: ProfitFormula;
  label: string;
};

/** Slot generik — sourceColumn dan kasbonColumn tidak lagi menunjuk ke kolom keuangan legacy.
 *  Slot diisi oleh finance_metric_mappings.source_column (formula key) yang disimpan di transaction_computed. */
export const PROFIT_SHARE_SLOTS: ProfitShareSlotDef[] = [
  {
    sourceColumn: "bagi_hasil_slot_1",
    kasbonColumn: "kasbon_slot_1",
    pribadiKategori: "PRIBADI-A",
    defaultFormula: "third_minus_kasbon",
    label: lookupFinanceSlotLabel("bagi_hasil_slot_1"),
  },
  {
    sourceColumn: "bagi_hasil_slot_2",
    kasbonColumn: "kasbon_slot_2",
    pribadiKategori: "PRIBADI-S",
    defaultFormula: "third_minus_kasbon",
    label: lookupFinanceSlotLabel("bagi_hasil_slot_2"),
  },
  {
    sourceColumn: "bagi_hasil_slot_3",
    kasbonColumn: null,
    pribadiKategori: null,
    defaultFormula: "incremental_investor",
    label: lookupFinanceSlotLabel("bagi_hasil_slot_3"),
  },
];

export type ProfitSharePartnerRuntime = {
  participantId: string | null;
  displayName: string;
  sourceColumn: string;
  formula: ProfitFormula;
  shareDivisor: number;
  sharePercent: number;
  participantRole: string;
  kasbonColumn: string | null;
  pribadiKategori: string | null;
};

export const PROFIT_FORMULA_LABELS: Record<ProfitFormula, string> = {
  percentage_based: "Persentase dari laba bersih",
  third_minus_kasbon: "Bagian laba ÷ pembagian − kasbon",
  incremental_investor: "Akumulasi kenaikan laba ÷ pembagian + transaksi investor",
};

export const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  PEMILIK: "Pemilik",
  MANAGER: "Manager",
  INVESTOR: "Investor",
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
    sharePercent: 100,
    participantRole: "PEMILIK",
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
  share_percent?: number | null;
  participant_role?: string | null;
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
      sharePercent:
        participant.share_percent != null ? Number(participant.share_percent) : 100,
      participantRole: participant.participant_role ?? "PEMILIK",
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

/** Slot with a mapping row but not yet linked to a person */
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
