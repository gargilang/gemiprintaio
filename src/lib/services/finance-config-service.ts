import "server-only";

import { db, getServerSupabaseClient } from "@/lib/db-unified";
import {
  deriveParticipantNameFromSourceColumn,
  resolveMetricParticipantName,
} from "@/lib/finance-metric-utils";
import {
  type ProfitFormula,
  PROFIT_SHARE_SLOTS,
  buildProfitSharePartnersFromConfig,
  resolveProfitShareSlotForNewPartner,
  slotForSourceColumn,
} from "@/lib/profit-share-config";

export interface FinanceCategoryDefinition {
  id?: string;
  category_code: string;
  display_name: string;
  color_bg: string;
  color_text: string;
  color_border: string;
  direction: "debit" | "kredit" | "both";
  display_order: number;
}

export interface FinanceMetricMapping {
  id?: string;
  metric_key: string;
  metric_label: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  source_column: string;
  participant_id?: string | null;
  participant_name: string | null;
  display_order: number;
}

export interface FinanceParticipant {
  id: string;
  participant_code: string;
  display_name: string;
  role_type: "profit_share" | "cash_advance" | "other";
  display_order: number;
  is_active: number;
  profit_formula?: ProfitFormula | null;
  share_divisor?: number | null;
  bagi_hasil_column?: string | null;
  kasbon_column?: string | null;
  pribadi_kategori?: string | null;
}

export interface FinanceConfigPayload {
  categories: FinanceCategoryDefinition[];
  participants: FinanceParticipant[];
  metricMappings: FinanceMetricMapping[];
}

const DEFAULT_CATEGORIES: FinanceCategoryDefinition[] = [
  { category_code: "KAS", display_name: "Kas", color_bg: "bg-blue-100", color_text: "text-blue-800", color_border: "border-blue-300", direction: "both", display_order: 10 },
  { category_code: "BIAYA", display_name: "Biaya", color_bg: "bg-red-100", color_text: "text-red-800", color_border: "border-red-300", direction: "kredit", display_order: 20 },
  { category_code: "OMZET", display_name: "Omzet", color_bg: "bg-green-100", color_text: "text-green-800", color_border: "border-green-300", direction: "debit", display_order: 30 },
  { category_code: "INVESTOR", display_name: "Investor", color_bg: "bg-purple-100", color_text: "text-purple-800", color_border: "border-purple-300", direction: "both", display_order: 40 },
  { category_code: "SUBSIDI", display_name: "Subsidi", color_bg: "bg-yellow-100", color_text: "text-yellow-800", color_border: "border-yellow-300", direction: "debit", display_order: 50 },
  { category_code: "LUNAS", display_name: "Lunas", color_bg: "bg-teal-100", color_text: "text-teal-800", color_border: "border-teal-300", direction: "debit", display_order: 60 },
  { category_code: "SUPPLY", display_name: "Supply", color_bg: "bg-orange-100", color_text: "text-orange-800", color_border: "border-orange-300", direction: "kredit", display_order: 70 },
  { category_code: "LABA", display_name: "Laba", color_bg: "bg-emerald-100", color_text: "text-emerald-800", color_border: "border-emerald-300", direction: "both", display_order: 80 },
  { category_code: "KOMISI", display_name: "Komisi", color_bg: "bg-cyan-100", color_text: "text-cyan-800", color_border: "border-cyan-300", direction: "kredit", display_order: 90 },
  { category_code: "TABUNGAN", display_name: "Tabungan", color_bg: "bg-indigo-100", color_text: "text-indigo-800", color_border: "border-indigo-300", direction: "kredit", display_order: 100 },
  { category_code: "HUTANG", display_name: "Hutang", color_bg: "bg-rose-100", color_text: "text-rose-800", color_border: "border-rose-300", direction: "kredit", display_order: 110 },
  { category_code: "PIUTANG", display_name: "Piutang", color_bg: "bg-lime-100", color_text: "text-lime-800", color_border: "border-lime-300", direction: "debit", display_order: 120 },
  { category_code: "PRIBADI-A", display_name: "Pribadi A", color_bg: "bg-sky-100", color_text: "text-sky-800", color_border: "border-sky-300", direction: "both", display_order: 130 },
  { category_code: "PRIBADI-S", display_name: "Pribadi S", color_bg: "bg-pink-100", color_text: "text-pink-800", color_border: "border-pink-300", direction: "both", display_order: 140 },
];

const DEFAULT_MAPPINGS: FinanceMetricMapping[] = [
  { metric_key: "bagi_hasil_anwar", metric_label: "Bagi Hasil", metric_group: "profit_share", source_column: "bagi_hasil_anwar", participant_name: "Mitra bagi hasil 1", display_order: 10 },
  { metric_key: "bagi_hasil_suri", metric_label: "Bagi Hasil", metric_group: "profit_share", source_column: "bagi_hasil_suri", participant_name: "Mitra bagi hasil 2", display_order: 20 },
  { metric_key: "bagi_hasil_gemi", metric_label: "Bagi Hasil", metric_group: "profit_share", source_column: "bagi_hasil_gemi", participant_name: "Mitra bagi hasil 3", display_order: 30 },
  { metric_key: "kasbon_cahaya", metric_label: "Kasbon", metric_group: "cash_advance", source_column: "kasbon_cahaya", participant_name: "Karyawan 1", display_order: 40 },
  { metric_key: "kasbon_dinil", metric_label: "Kasbon", metric_group: "cash_advance", source_column: "kasbon_dinil", participant_name: "Karyawan 2", display_order: 50 },
];

async function nextDisplayOrderParticipants(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("finance_participants")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (Number((data as { display_order?: number })?.display_order) || 0) + 10;
  }
  const existing = await db.queryRaw<{ max_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS max_order FROM finance_participants"
  );
  return (existing[0]?.max_order || 0) + 10;
}

async function nextDisplayOrderCategories(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("finance_category_definitions")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (Number((data as { display_order?: number })?.display_order) || 0) + 10;
  }
  const existing = await db.queryRaw<{ max_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS max_order FROM finance_category_definitions"
  );
  return (existing[0]?.max_order || 0) + 10;
}

async function nextDisplayOrderMappings(): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { data } = await sb
      .from("finance_metric_mappings")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (Number((data as { display_order?: number })?.display_order) || 0) + 10;
  }
  const existing = await db.queryRaw<{ max_order: number }>(
    "SELECT COALESCE(MAX(display_order), 0) AS max_order FROM finance_metric_mappings"
  );
  return (existing[0]?.max_order || 0) + 10;
}

export async function getFinanceConfig(): Promise<FinanceConfigPayload> {
  let categoriesResult = {
    data: null as FinanceCategoryDefinition[] | null,
  };
  let metricRows: FinanceMetricMapping[] = [];
  let participantRows: FinanceParticipant[] = [];

  try {
    const categoriesQuery = await db.query<FinanceCategoryDefinition>(
      "finance_category_definitions",
      {
        where: { is_active: 1 },
        orderBy: { column: "display_order", ascending: true },
      }
    );
    categoriesResult = { data: categoriesQuery.data };
  } catch {
    categoriesResult = { data: null };
  }

  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from("finance_participants")
        .select(
          "id, participant_code, display_name, role_type, display_order, is_active, profit_formula, share_divisor, bagi_hasil_column, kasbon_column, pribadi_kategori"
        )
        .eq("is_active", 1)
        .order("display_order", { ascending: true });
      if (error) throw error;
      participantRows = (data || []) as FinanceParticipant[];
    } else {
      participantRows =
        (
          await db.query<FinanceParticipant>("finance_participants", {
            where: { is_active: 1 },
            orderBy: { column: "display_order", ascending: true },
          })
        ).data || [];
    }
  } catch {
    participantRows = [];
  }

  try {
    const sb = getServerSupabaseClient();
    if (sb) {
      const { data: mappings, error: em } = await sb
        .from("finance_metric_mappings")
        .select(
          "id, metric_key, metric_label, metric_group, source_column, participant_id, display_order"
        )
        .eq("is_active", 1)
        .order("metric_group", { ascending: true })
        .order("display_order", { ascending: true });
      if (em) throw em;

      const { data: participants } = await sb
        .from("finance_participants")
        .select("id, display_name")
        .eq("is_active", 1);

      const pmap = new Map(
        (participants || []).map((p: { id: string; display_name: string }) => [
          p.id,
          p.display_name,
        ])
      );

      metricRows = (mappings || []).map((m: Record<string, unknown>) => {
        const sourceColumn = m.source_column as string;
        const participantId = (m.participant_id as string | null) ?? null;
        const linkedName = participantId
          ? pmap.get(participantId) ?? null
          : null;
        return {
          id: m.id as string,
          metric_key: m.metric_key as string,
          metric_label: m.metric_label as string,
          metric_group: m.metric_group as FinanceMetricMapping["metric_group"],
          source_column: sourceColumn,
          participant_id: participantId,
          participant_name:
            linkedName ??
            deriveParticipantNameFromSourceColumn(sourceColumn),
          display_order: Number(m.display_order),
        };
      });
    } else {
      metricRows = await db.queryRaw<FinanceMetricMapping>(
        `SELECT
        m.id,
        m.metric_key,
        m.metric_label,
        m.metric_group,
        m.source_column,
        m.participant_id,
        p.display_name AS participant_name,
        m.display_order
      FROM finance_metric_mappings m
      LEFT JOIN finance_participants p ON p.id = m.participant_id
      WHERE m.is_active = 1
      ORDER BY m.metric_group ASC, m.display_order ASC`
      );
    }
  } catch {
    metricRows = [];
  }

  metricRows = metricRows.map((m) => ({
    ...m,
    participant_name:
      resolveMetricParticipantName(m) ?? m.participant_name ?? null,
  }));

  participantRows = await enrichParticipantProfitDefaults(
    participantRows,
    metricRows
  );

  return {
    categories: categoriesResult.data?.length ? categoriesResult.data : DEFAULT_CATEGORIES,
    participants: participantRows,
    metricMappings: metricRows?.length ? metricRows : DEFAULT_MAPPINGS,
  };
}

export async function getProfitSharePartnersForRecalc() {
  const config = await getFinanceConfig();
  return buildProfitSharePartnersFromConfig(
    config.participants,
    config.metricMappings
  );
}

async function enrichParticipantProfitDefaults(
  rows: FinanceParticipant[],
  mappings: FinanceMetricMapping[]
): Promise<FinanceParticipant[]> {
  return rows.map((p) => {
    if (p.role_type !== "profit_share") return p;
    const linkedMapping = mappings.find(
      (m) =>
        m.metric_group === "profit_share" && m.participant_id === p.id
    );
    const mappingCol =
      p.bagi_hasil_column ||
      linkedMapping?.source_column ||
      PROFIT_SHARE_SLOTS.find((s) =>
        s.label.toLowerCase().includes(p.display_name.toLowerCase())
      )?.sourceColumn;
    const slot = mappingCol ? slotForSourceColumn(mappingCol) : undefined;
    return {
      ...p,
      profit_formula:
        (p.profit_formula as ProfitFormula | null) ||
        slot?.defaultFormula ||
        "third_minus_kasbon",
      share_divisor: p.share_divisor && p.share_divisor > 0 ? p.share_divisor : 3,
      bagi_hasil_column: p.bagi_hasil_column ?? slot?.sourceColumn ?? null,
      kasbon_column: p.kasbon_column ?? slot?.kasbonColumn ?? null,
      pribadi_kategori: p.pribadi_kategori ?? slot?.pribadiKategori ?? null,
    };
  });
}

export async function createFinanceParticipant(input: {
  participant_code: string;
  display_name: string;
  role_type: "profit_share" | "cash_advance" | "other";
  profit_formula?: ProfitFormula | null;
  share_divisor?: number;
  bagi_hasil_column?: string | null;
  kasbon_column?: string | null;
  pribadi_kategori?: string | null;
}) {
  const id = `fin-participant-${Date.now()}`;
  const displayOrder = await nextDisplayOrderParticipants();
  const payload: Record<string, unknown> = {
    id,
    participant_code: input.participant_code.toUpperCase().trim(),
    display_name: input.display_name.trim(),
    role_type: input.role_type,
    display_order: displayOrder,
    is_active: 1,
  };
  if (input.role_type === "profit_share") {
    payload.profit_formula = input.profit_formula ?? "third_minus_kasbon";
    payload.share_divisor = input.share_divisor ?? 3;
    payload.bagi_hasil_column = input.bagi_hasil_column ?? null;
    payload.kasbon_column = input.kasbon_column ?? null;
    payload.pribadi_kategori = input.pribadi_kategori ?? null;
  }
  return db.insert("finance_participants", payload);
}

export async function updateProfitShareParticipant(
  id: string,
  input: {
    profit_formula: ProfitFormula;
    share_divisor: number;
  }
) {
  const divisor = input.share_divisor > 0 ? input.share_divisor : 3;
  const sb = getServerSupabaseClient();
  const patch = {
    profit_formula: input.profit_formula,
    share_divisor: divisor,
    updated_at: new Date().toISOString(),
  };
  if (sb) {
    const { error } = await sb
      .from("finance_participants")
      .update(patch)
      .eq("id", id);
    if (error) return { data: null, error: new Error(error.message) };
  }
  return db.update("finance_participants", id, {
    profit_formula: input.profit_formula,
    share_divisor: divisor,
  });
}

export async function setupBagiHasilPartner(input: {
  display_name: string;
  profit_formula?: ProfitFormula;
  share_divisor?: number;
  source_column?: string;
}) {
  const name = input.display_name.trim();
  if (!name) {
    return { data: null, error: new Error("Nama mitra bagi hasil wajib diisi.") };
  }

  const config = await getFinanceConfig();
  const slot = resolveProfitShareSlotForNewPartner(
    config.metricMappings,
    input.source_column
  );

  if (!slot) {
    return {
      data: null,
      error: new Error(
        "Semua slot bagi hasil sudah terpakai (maks. 3 mitra). Hapus mitra lain terlebih dahulu."
      ),
    };
  }

  const existing = config.metricMappings.find(
    (m) =>
      m.metric_group === "profit_share" && m.source_column === slot.sourceColumn
  );

  if (existing?.participant_id) {
    return {
      data: null,
      error: new Error(
        `Slot ${slot.label} sudah dipakai mitra lain. Hapus mitra lama terlebih dahulu.`
      ),
    };
  }

  const formula = input.profit_formula ?? slot.defaultFormula;
  const shareDivisor = input.share_divisor && input.share_divisor > 0 ? input.share_divisor : 3;
  const code = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 16) || `MITRA${Date.now().toString(36).toUpperCase().slice(-6)}`;

  const created = await createFinanceParticipant({
    participant_code: code,
    display_name: name,
    role_type: "profit_share",
    profit_formula: formula,
    share_divisor: shareDivisor,
    bagi_hasil_column: slot.sourceColumn,
    kasbon_column: slot.kasbonColumn,
    pribadi_kategori: slot.pribadiKategori,
  });
  if (created.error) return created;

  const participantId = (created.data as { id: string })?.id;
  if (!participantId) {
    return { data: null, error: new Error("Gagal membuat mitra bagi hasil.") };
  }

  if (existing?.id) {
    const updated = await updateFinanceMetricMapping(existing.id, {
      participant_id: participantId,
      metric_group: "profit_share",
    });
    if (updated.error) return updated;
    return { data: { participantId, mappingId: existing.id }, error: null };
  }

  const mapped = await createFinanceMetricMapping({
    metric_key: `${slot.sourceColumn}_${Date.now()}`,
    metric_label: "Bagi Hasil",
    metric_group: "profit_share",
    source_column: slot.sourceColumn,
    participant_id: participantId,
  });
  if (mapped.error) return mapped;
  return {
    data: { participantId, mappingId: (mapped.data as { id: string })?.id },
    error: null,
  };
}

export async function removeBagiHasilPartner(participantId: string) {
  const config = await getFinanceConfig();
  const mappings = config.metricMappings.filter(
    (m) => m.participant_id === participantId && m.metric_group === "profit_share"
  );
  for (const m of mappings) {
    if (m.id) {
      const del = await deleteFinanceMetricMapping(m.id);
      if (del.error) return del;
    }
  }
  return deleteFinanceParticipant(participantId);
}

export async function countActiveMappingsForParticipant(
  participantId: string
): Promise<number> {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { count, error } = await sb
      .from("finance_metric_mappings")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId)
      .eq("is_active", 1);
    if (error) throw error;
    return count ?? 0;
  }
  const rows = await db.queryRaw<{ c: number }>(
    `SELECT COUNT(*) AS c FROM finance_metric_mappings
     WHERE participant_id = ? AND is_active = 1`,
    [participantId]
  );
  return rows[0]?.c ?? 0;
}

export async function deleteFinanceParticipant(id: string) {
  const linked = await countActiveMappingsForParticipant(id);
  if (linked > 0) {
    return {
      data: null,
      error: new Error(
        `Masih ada ${linked} kartu ringkasan yang memakai orang ini. Hapus kartu tersebut di tab Kartu ringkasan terlebih dahulu.`
      ),
    };
  }

  const sb = getServerSupabaseClient();
  if (sb) {
    const { error: participantError } = await sb
      .from("finance_participants")
      .update({ is_active: 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (participantError) {
      return { data: null, error: new Error(participantError.message) };
    }

    await db.update("finance_participants", id, { is_active: 0 });
    return { data: { id }, error: null };
  }

  return db.update("finance_participants", id, { is_active: 0 });
}

export async function createFinanceCategory(input: {
  category_code: string;
  display_name: string;
}) {
  const id = `fin-cat-${Date.now()}`;
  const displayOrder = await nextDisplayOrderCategories();
  return db.insert("finance_category_definitions", {
    id,
    category_code: input.category_code.toUpperCase().trim(),
    display_name: input.display_name.trim(),
    color_bg: "bg-gray-100",
    color_text: "text-gray-800",
    color_border: "border-gray-300",
    direction: "both",
    display_order: displayOrder,
    is_active: 1,
  });
}

export async function deleteFinanceCategory(id: string) {
  return db.update("finance_category_definitions", id, { is_active: 0 });
}

export async function createFinanceMetricMapping(input: {
  metric_key: string;
  metric_label: string;
  metric_group: "summary" | "profit_share" | "cash_advance";
  source_column: string;
  participant_id?: string | null;
}) {
  const id = `fin-metric-${Date.now()}`;
  const displayOrder = await nextDisplayOrderMappings();
  return db.insert("finance_metric_mappings", {
    id,
    metric_key: input.metric_key.trim(),
    metric_label: input.metric_label.trim(),
    metric_group: input.metric_group,
    source_column: input.source_column.trim(),
    participant_id: input.participant_id || null,
    display_order: displayOrder,
    is_active: 1,
  });
}

export async function updateFinanceMetricMapping(
  id: string,
  input: {
    metric_label?: string;
    metric_group?: "summary" | "profit_share" | "cash_advance";
    source_column?: string;
    participant_id?: string | null;
  }
) {
  return db.update("finance_metric_mappings", id, input);
}

export async function deleteFinanceMetricMapping(id: string) {
  const sb = getServerSupabaseClient();
  if (sb) {
    const { error } = await sb
      .from("finance_metric_mappings")
      .update({ is_active: 0, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    await db.update("finance_metric_mappings", id, { is_active: 0 });
    return { data: { id }, error: null };
  }
  return db.update("finance_metric_mappings", id, { is_active: 0 });
}
