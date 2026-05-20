/**
 * Menjaga cashbook_partner + rumus bagi_hasil_* selaras dengan
 * finance_participants (Kelola Bagi Hasil / Orang di halaman Keuangan).
 */

import "server-only";

import type { ASTNode } from "@/lib/ast/types";
import {
  PROFIT_SHARE_SLOTS,
  buildProfitSharePartnersFromConfig,
  type ProfitShareMappingRow,
  type ProfitShareParticipantRow,
} from "@/lib/profit-share-config";
import {
  deletePartner,
  listFormulas,
  upsertFormula,
  upsertPartner,
} from "@/lib/services/cashbook-formula-service";

/** ID stabil untuk cashbook_partner dari nama tampilan (mis. "Cahaya" → partner-cahaya). */
export function partnerIdFromDisplayName(displayName: string): string {
  const slug = displayName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `partner-${slug || "unknown"}`;
}

function astPercentageShare(
  percent: number,
  labaColumnKey: string,
  kasbonColumnKey: string | null
): ASTNode {
  const pct: ASTNode = {
    type: "binaryOp",
    op: "/",
    left: { type: "literal", value: percent },
    right: { type: "literal", value: 100 },
  };
  const share: ASTNode = {
    type: "binaryOp",
    op: "*",
    left: { type: "outputRef", column: labaColumnKey },
    right: pct,
  };
  if (!kasbonColumnKey) return share;
  return {
    type: "binaryOp",
    op: "-",
    left: share,
    right: { type: "outputRef", column: kasbonColumnKey },
  };
}

/** Upsert mitra di cashbook_partner agar partnerRef di rumus kasbon mengenali nama. */
export async function syncCashbookPartnerFromParticipant(input: {
  display_name: string;
  role_type: string;
  pribadi_kategori?: string | null;
  display_order?: number;
}): Promise<void> {
  if (
    input.role_type !== "profit_share" &&
    input.role_type !== "cash_advance"
  ) {
    return;
  }
  const name = input.display_name.trim();
  if (!name) return;

  await upsertPartner({
    id: partnerIdFromDisplayName(name),
    name,
    category: input.pribadi_kategori ?? null,
    displayOrder: input.display_order ?? 0,
  });
}

export async function removeCashbookPartnerByDisplayName(
  displayName: string
): Promise<void> {
  const name = displayName.trim();
  if (!name) return;
  try {
    await deletePartner(partnerIdFromDisplayName(name));
  } catch {
    // Partner mungkin belum pernah dibuat
  }
}

/**
 * Perbarui AST kolom bagi_hasil_* untuk mitra dengan rumus percentage_based
 * sesuai share_percent dari Kelola Bagi Hasil.
 */
export async function syncProfitShareFormulas(
  participants: ProfitShareParticipantRow[],
  mappings: ProfitShareMappingRow[]
): Promise<void> {
  const partners = buildProfitSharePartnersFromConfig(participants, mappings);
  const formulas = await listFormulas();

  const labaFormula = formulas.find((f) => f.dbColumn === "laba_bersih");
  if (!labaFormula) return;
  const labaCol = labaFormula.column;

  for (const p of partners) {
    if (p.formula !== "percentage_based") continue;

    const slot = PROFIT_SHARE_SLOTS.find((s) => s.sourceColumn === p.sourceColumn);
    if (!slot) continue;

    const bagiFormula = formulas.find((f) => f.dbColumn === p.sourceColumn);
    if (!bagiFormula) continue;

    let kasbonColKey: string | null = null;
    const kasbonDb = p.kasbonColumn ?? slot.kasbonColumn;
    if (kasbonDb) {
      kasbonColKey =
        formulas.find((f) => f.dbColumn === kasbonDb)?.column ?? null;
    }

    const percent = p.sharePercent > 0 ? p.sharePercent : 0;
    const ast = astPercentageShare(percent, labaCol, kasbonColKey);

    await upsertFormula({
      ...bagiFormula,
      name: `Bagi Hasil ${p.displayName}`,
      ast,
      description: `${percent}% laba bersih${
        kasbonColKey ? " dikurangi kasbon terkait" : ""
      } (disinkronkan dari Kelola Bagi Hasil).`,
    });
  }
}

