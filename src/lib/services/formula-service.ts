/**
 * formula-service (v2)
 *
 * Generic AST formula generator for actor-driven calculations. Replaces
 * the hardcoded slot-based logic in profit-share-config.ts /
 * cashbook-config-sync.ts with one rule: every business_actor whose role
 * has a calc-typed group automatically gets a matching cashbook_formula
 * with a semantic `formula_key`, `actor_id`, and `formula_group`.
 *
 * Three patterns are supported today; new patterns are added by extending
 * the dispatch in `syncFormulasForActor`:
 *
 *   profit_share  → percentage of laba_bersih (optional minus kasbon)
 *   cash_advance  → running ledger from kategori + keperluan match
 *   bonus         → percentage of any other formula (e.g. omzet)
 *
 * The legacy column-letter system stays operational alongside this: the
 * auto-generated formulas pick fresh letters from a high-number range
 * (P, Q, R, …) so they coexist with the seeded G–K formulas without
 * collisions.
 */

import "server-only";

import type { ASTNode, FormulaDefinition, FormulaGroup } from "@/lib/ast/types";
import {
  deleteFormula,
  listFormulas,
  upsertFormula,
} from "@/lib/services/cashbook-formula-service";
import {
  getBusinessActor,
  listActorRoles,
  listBusinessActors,
  slugifyActorName,
} from "@/lib/services/business-actor-service";

// ── AST builders (small composable helpers) ─────────────────────────────────

const lit = (value: number | string | boolean): ASTNode => ({
  type: "literal",
  value,
});
const colRef = (c: "C" | "D" | "E" | "F"): ASTNode => ({
  type: "columnRef",
  column: c,
});
const prevOut = (key: string): ASTNode => ({ type: "prevOutput", column: key });
const curOut = (key: string): ASTNode => ({ type: "outputRef", column: key });
const rowNode = (): ASTNode => ({ type: "row" });
const ifNode = (cond: ASTNode, then: ASTNode, els: ASTNode): ASTNode => ({
  type: "if",
  cond,
  then,
  else: els,
});
const orNode = (left: ASTNode, right: ASTNode): ASTNode => ({
  type: "or",
  left,
  right,
});
const andNode = (left: ASTNode, right: ASTNode): ASTNode => ({
  type: "and",
  left,
  right,
});
const notNode = (arg: ASTNode): ASTNode => ({ type: "not", arg });
const isErrorNode = (arg: ASTNode): ASTNode => ({ type: "iserror", arg });
const searchNode = (find: ASTNode, within: ASTNode): ASTNode => ({
  type: "search",
  find,
  within,
});
const negateNode = (arg: ASTNode): ASTNode => ({ type: "negate", arg });
const opNode = (
  o: "+" | "-" | "*" | "/" | "=" | "<>" | ">" | "<" | ">=" | "<=",
  l: ASTNode,
  r: ASTNode
): ASTNode => ({ type: "binaryOp", op: o, left: l, right: r });

const isFirstRowNode = (): ASTNode => opNode("=", rowNode(), lit(2));

// ── AST templates ───────────────────────────────────────────────────────────

/**
 * percentage_of_formula:
 *   value = sourceFormula × (percent / 100)
 *
 * Used for sales bonuses ("Bonus 5% Omzet") and the v2 profit_share
 * pattern when only a percentage is given (no kasbon adjustment).
 */
function astPercentageOfFormula(
  sourceFormulaKey: string,
  percent: number
): ASTNode {
  const pct: ASTNode = opNode("/", lit(percent), lit(100));
  return opNode("*", curOut(sourceFormulaKey), pct);
}

/**
 * profit_share_minus_kasbon:
 *   value = laba_bersih × (percent / 100) − kasbon_<actor>
 *
 * If `kasbonFormulaKey` is null we degrade to plain percentage_of_formula.
 */
function astProfitShareMinusKasbon(
  percent: number,
  labaFormulaKey: string,
  kasbonFormulaKey: string | null
): ASTNode {
  const base = astPercentageOfFormula(labaFormulaKey, percent);
  if (!kasbonFormulaKey) return base;
  return opNode("-", base, curOut(kasbonFormulaKey));
}

/**
 * cash_advance_running_balance:
 *   If row's kategori is in `categories` AND (no keyword OR keperluan matches),
 *     row contribution = (D ? prev - D : prev + E)
 *   Otherwise carry forward prev.
 *
 * Categories list MUST be non-empty. Keyword is optional substring match
 * against `keperluan` (case-insensitive, via SEARCH/ISERROR).
 */
function astCashAdvanceLedger(
  formulaKey: string,
  categories: string[],
  keperluanKeyword: string | null
): ASTNode {
  // Build (C = cat1) OR (C = cat2) OR ...
  const categoryCond = categories.reduce<ASTNode>((acc, code, idx) => {
    const eq: ASTNode = opNode("=", colRef("C"), lit(code));
    return idx === 0 ? eq : orNode(acc, eq);
  }, lit(false));

  const keywordCond: ASTNode = keperluanKeyword
    ? notNode(isErrorNode(searchNode(lit(keperluanKeyword), colRef("F"))))
    : lit(true);

  const fullCond = andNode(categoryCond, keywordCond);

  const rowImpact = ifNode(
    isFirstRowNode(),
    ifNode(colRef("D"), negateNode(colRef("D")), colRef("E")),
    ifNode(
      colRef("D"),
      opNode("-", prevOut(formulaKey), colRef("D")),
      opNode("+", prevOut(formulaKey), colRef("E"))
    )
  );

  const noImpact = ifNode(isFirstRowNode(), lit(0), prevOut(formulaKey));

  return ifNode(fullCond, rowImpact, noImpact);
}

// ── Letter allocation for legacy column_key ─────────────────────────────────

/**
 * Pick a fresh column letter for new actor-generated formulas. The legacy
 * letter system is still used by the editor UI and the existing formula
 * graph. New actor formulas live in the P..Z range; if that ever fills
 * up we fall back to AA, AB, ... (no real upper bound).
 */
function nextColumnLetter(used: Set<string>): string {
  const candidates = [
    "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  ];
  for (const c of candidates) {
    if (!used.has(c)) return c;
  }
  // Spillover into AA, AB, …
  for (let i = 0; i < 26 * 26; i++) {
    const code = `A${String.fromCharCode(65 + i)}`;
    if (!used.has(code)) return code;
  }
  return `X${Date.now().toString(36).toUpperCase()}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface SyncFormulasResult {
  created: string[];   // formula_key values that were created
  updated: string[];   // formula_key values that were updated in place
  removed: string[];   // formula_key values that were detached
}

/**
 * Given an actor, inspect their calc fields and ensure cashbook_formula has
 * exactly the right set of formulas attached to them.
 *
 * Role is purely a job-title label — it does NOT restrict which formula types
 * an actor can have. Formula generation is driven entirely by which fields are
 * non-null/non-empty on the actor row:
 *
 *   profit_share_percent IS NOT NULL  → upsert "bagi_hasil_<slug>"
 *   cash_advance_categories non-empty → upsert "kasbon_<slug>"
 *   bonus_percent IS NOT NULL         → upsert "bonus_<slug>"
 *
 * A single actor may have all three at once (e.g. a managing director who
 * receives profit share, has a cash advance, AND a sales bonus).
 *
 * When actor is inactive, all linked formulas are disabled (not deleted).
 */
export async function syncFormulasForActor(
  actorId: string
): Promise<SyncFormulasResult> {
  const result: SyncFormulasResult = { created: [], updated: [], removed: [] };

  const actor = await getBusinessActor(actorId);
  if (!actor) return result;

  const allFormulas = await listFormulas();
  const existing = allFormulas.filter((f) => f.actorId === actorId);

  // When actor is inactive, disable all linked formulas rather than deleting,
  // so historical recalc data remains valid.
  if (actor.is_active === 0) {
    for (const f of existing) {
      if (f.enabled) {
        await upsertFormula({ ...f, enabled: false });
        if (f.formulaKey) result.removed.push(f.formulaKey);
      }
    }
    return result;
  }

  const slug = slugifyActorName(actor.display_name);
  const labaKey = "laba_bersih";

  type FormulaTemplate = {
    formulaKey: string;
    name: string;
    description: string;
    group: FormulaGroup;
    ast: ASTNode;
  };

  // Build the complete desired set from whichever fields are filled in.
  const desired: FormulaTemplate[] = [];

  if (actor.profit_share_percent !== null) {
    const percent = Number(actor.profit_share_percent);
    const formulaKey = `bagi_hasil_${slug}`;
    desired.push({
      formulaKey,
      name: `Bagi Hasil ${actor.display_name}`,
      description: `${percent}% dari laba bersih.`,
      group: "profit_share",
      ast: astProfitShareMinusKasbon(percent, labaKey, null),
    });
  }

  const cats = actor.cash_advance_categories ?? [];
  if (cats.length > 0) {
    const formulaKey = `kasbon_${slug}`;
    desired.push({
      formulaKey,
      name: `Kasbon ${actor.display_name}`,
      description: actor.keperluan_keyword
        ? `Akumulasi kategori ${cats.join("/")} dengan keperluan mengandung "${actor.keperluan_keyword}".`
        : `Akumulasi kategori ${cats.join("/")}.`,
      group: "cash_advance",
      ast: astCashAdvanceLedger(formulaKey, cats, actor.keperluan_keyword),
    });
  }

  if (actor.bonus_percent !== null) {
    const percent = Number(actor.bonus_percent);
    const source = actor.bonus_source_formula_key || "omzet";
    const formulaKey = `bonus_${slug}`;
    desired.push({
      formulaKey,
      name: `Bonus ${actor.display_name}`,
      description: `${percent}% dari ${source}.`,
      group: "bonus",
      ast: astPercentageOfFormula(source, percent),
    });
  }

  const desiredKeys = new Set(desired.map((d) => d.formulaKey));

  // Remove (disable) formulas that are no longer in the desired set.
  for (const f of existing) {
    if (!desiredKeys.has(f.formulaKey ?? "")) {
      await upsertFormula({ ...f, enabled: false });
      if (f.formulaKey) result.removed.push(f.formulaKey);
    }
  }

  // Upsert every desired formula, reusing existing letter slots when possible.
  const usedLetters = new Set(allFormulas.map((f) => f.column.toUpperCase()));
  for (const template of desired) {
    const reusable = allFormulas.find(
      (f) => (f.formulaKey ?? f.dbColumn) === template.formulaKey
    );
    const letter = reusable?.column ?? nextColumnLetter(usedLetters);
    usedLetters.add(letter.toUpperCase());

    const formula: Omit<FormulaDefinition, "id"> & { id?: string } = {
      id: reusable?.id,
      name: template.name,
      column: letter,
      dbColumn: template.formulaKey,
      formulaKey: template.formulaKey,
      actorId: actor.id,
      formulaGroup: template.group,
      ast: template.ast,
      enabled: true,
      isSystem: false,
      displayOrder: baseDisplayOrderForGroup(template.group),
      description: template.description,
    };

    await upsertFormula(formula);
    if (reusable) result.updated.push(template.formulaKey);
    else result.created.push(template.formulaKey);
  }

  return result;
}

/** Re-run sync for every active actor (used after bulk percent rebalance). */
export async function syncAllActiveActorFormulas(
  actorIds: string[]
): Promise<void> {
  for (const id of actorIds) {
    await syncFormulasForActor(id);
  }
}

/** Base display_order so groups sort consistently in the formula list. */
function baseDisplayOrderForGroup(group: FormulaGroup): number {
  switch (group) {
    case "summary":
      return 10;
    case "profit_share":
      return 200 + Math.floor(Math.random() * 50);
    case "cash_advance":
      return 300 + Math.floor(Math.random() * 50);
    case "bonus":
      return 400 + Math.floor(Math.random() * 50);
    default:
      return 500 + Math.floor(Math.random() * 100);
  }
}

/** Convenience: load a single formula by its semantic key. */
export async function getFormulaByKey(
  formulaKey: string
): Promise<FormulaDefinition | null> {
  const all = await listFormulas();
  return all.find((f) => (f.formulaKey ?? f.dbColumn) === formulaKey) ?? null;
}

/** List formulas in one of the v2 groups (Ringkasan / Bagi Hasil / Kasbon / Bonus / Kustom). */
export async function listFormulasByGroup(
  group: FormulaGroup
): Promise<FormulaDefinition[]> {
  const all = await listFormulas();
  return all
    .filter((f) => (f.formulaGroup ?? "custom") === group && f.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Snapshot of formulas grouped by their v2 formula_group. Convenience for
 * the new UI bars.
 */
export interface ActiveFormulasByGroup {
  summary: FormulaDefinition[];
  profit_share: FormulaDefinition[];
  cash_advance: FormulaDefinition[];
  bonus: FormulaDefinition[];
  custom: FormulaDefinition[];
}

export async function getActiveFormulasByGroup(): Promise<ActiveFormulasByGroup> {
  const all = (await listFormulas()).filter((f) => f.enabled);
  const out: ActiveFormulasByGroup = {
    summary: [],
    profit_share: [],
    cash_advance: [],
    bonus: [],
    custom: [],
  };
  for (const f of all) {
    const g = f.formulaGroup ?? "custom";
    if (g in out) out[g as keyof ActiveFormulasByGroup].push(f);
    else out.custom.push(f);
  }
  for (const k of Object.keys(out)) {
    out[k as keyof ActiveFormulasByGroup].sort(
      (a, b) => a.displayOrder - b.displayOrder
    );
  }
  return out;
}

/** One column in the dynamic per-actor summary table. */
export interface ActorSummaryColumn {
  formulaKey: string;
  label: string;
  group: FormulaGroup;
}

/** One row for the Keuangan v2 table — all metrics for one person on one line. */
export interface ActorFinanceSummaryRow {
  actorId: string | null;
  displayName: string;
  roleLabel: string;
  /** Map of formula_key → numeric value (or null when not applicable). */
  metrics: Record<string, number | null>;
  displayOrder: number;
  /** True when this row is a global formula (no linked business_actor). */
  isGlobal: boolean;
}

export interface ActorFinanceSummary {
  /** Columns to render, in the order they should appear. */
  columns: ActorSummaryColumn[];
  /** Per-actor rows plus a final block of global custom formulas if any. */
  rows: ActorFinanceSummaryRow[];
}

/**
 * Build the dynamic per-actor summary feed. The column set is derived from
 * `is_visible_in_summary = true` formulas plus a stable canonical ordering
 * (Bagi Hasil → Kasbon → Bonus → Kustom). Rows with `actor_id` go in the
 * actor block; visible custom rows without an actor become "(global)" rows.
 */
export async function getActorFinanceSummary(
  valuesByKey: Record<string, number>
): Promise<ActorFinanceSummary> {
  const [actors, roles, formulas] = await Promise.all([
    listBusinessActors({ includeInactive: false }),
    listActorRoles(),
    listFormulas(),
  ]);

  const roleLabelByCode = new Map(roles.map((r) => [r.role_code, r.role_label]));
  const visibleFormulas = formulas.filter(
    (f) => f.enabled && f.isVisibleInSummary
  );

  // Build column set deterministically. Group order matches the UI:
  // profit_share → cash_advance → bonus → custom (summary excluded; those
  // already live in the cards above the table).
  const groupRank: Record<FormulaGroup, number> = {
    summary: 99,
    profit_share: 0,
    cash_advance: 1,
    bonus: 2,
    custom: 3,
  };
  const columns: ActorSummaryColumn[] = [];
  const seen = new Set<string>();
  for (const f of visibleFormulas
    .slice()
    .sort((a, b) => {
      const ra = groupRank[a.formulaGroup ?? "custom"] ?? 99;
      const rb = groupRank[b.formulaGroup ?? "custom"] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.displayOrder - b.displayOrder;
    })) {
    const key = f.formulaKey ?? f.dbColumn;
    if (!key || seen.has(key)) continue;
    if ((f.formulaGroup ?? "custom") === "summary") continue;
    seen.add(key);
    columns.push({
      formulaKey: key,
      label: f.name,
      group: f.formulaGroup ?? "custom",
    });
  }

  // For per-row aggregation, we still need to know which formula keys
  // belong to which actor (so each actor only shows their own metrics).
  const formulasByActor = new Map<string, FormulaDefinition[]>();
  const globalCustomFormulas: FormulaDefinition[] = [];
  for (const f of visibleFormulas) {
    if (f.actorId) {
      const list = formulasByActor.get(f.actorId) ?? [];
      list.push(f);
      formulasByActor.set(f.actorId, list);
    } else if ((f.formulaGroup ?? "custom") === "custom") {
      globalCustomFormulas.push(f);
    }
  }

  const value = (key: string): number | null => {
    const v = valuesByKey[key];
    return v === undefined || v === null ? 0 : Number(v);
  };

  // Map per-actor rows. A cell is null when the actor has no formula for
  // that key (so the UI can render "—" instead of 0).
  const actorRows: ActorFinanceSummaryRow[] = actors
    .map((actor) => {
      const linked = formulasByActor.get(actor.id) ?? [];
      const linkedKeys = new Set(
        linked.map((f) => f.formulaKey ?? f.dbColumn)
      );
      const metrics: Record<string, number | null> = {};
      for (const col of columns) {
        metrics[col.formulaKey] = linkedKeys.has(col.formulaKey)
          ? value(col.formulaKey)
          : null;
      }
      return {
        actorId: actor.id,
        displayName: actor.display_name,
        roleLabel:
          roleLabelByCode.get(actor.role_code) ?? actor.role_code,
        metrics,
        displayOrder: actor.display_order,
        isGlobal: false,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Append global custom formulas as standalone rows so user-defined
  // metrics that don't belong to a person still surface in the panel.
  const globalRows: ActorFinanceSummaryRow[] = globalCustomFormulas.map(
    (f) => {
      const metrics: Record<string, number | null> = {};
      for (const col of columns) {
        metrics[col.formulaKey] =
          col.formulaKey === (f.formulaKey ?? f.dbColumn)
            ? value(col.formulaKey)
            : null;
      }
      return {
        actorId: null,
        displayName: f.name,
        roleLabel: "Rumus kustom",
        metrics,
        displayOrder: 9_000_000 + f.displayOrder,
        isGlobal: true,
      };
    }
  );

  return { columns, rows: [...actorRows, ...globalRows] };
}

/**
 * Legacy adapter retained until UI callers migrate to `getActorFinanceSummary`.
 *
 * @deprecated Prefer `getActorFinanceSummary` — it returns adaptive columns
 *             driven by `is_visible_in_summary` instead of the hardcoded
 *             three-slot layout.
 */
export async function getActorFinanceSummaryRows(
  valuesByKey: Record<string, number>
): Promise<
  Array<{
    actorId: string;
    displayName: string;
    roleLabel: string;
    profitShare: number | null;
    cashAdvance: number | null;
    bonus: number | null;
    displayOrder: number;
  }>
> {
  const summary = await getActorFinanceSummary(valuesByKey);
  return summary.rows
    .filter((r) => !r.isGlobal && r.actorId !== null)
    .map((r) => {
      const ps = summary.columns.find((c) => c.group === "profit_share");
      const ca = summary.columns.find((c) => c.group === "cash_advance");
      const bn = summary.columns.find((c) => c.group === "bonus");
      return {
        actorId: r.actorId as string,
        displayName: r.displayName,
        roleLabel: r.roleLabel,
        profitShare: ps ? r.metrics[ps.formulaKey] ?? null : null,
        cashAdvance: ca ? r.metrics[ca.formulaKey] ?? null : null,
        bonus: bn ? r.metrics[bn.formulaKey] ?? null : null,
        displayOrder: r.displayOrder,
      };
    });
}

/** Count enabled actor-type formulas that are not linked to any business_actor. */
export async function countLegacyOrphanActorFormulas(): Promise<number> {
  const all = await listFormulas();
  return all.filter(
    (f) =>
      f.enabled &&
      !f.actorId &&
      (f.formulaGroup === "profit_share" ||
        f.formulaGroup === "cash_advance" ||
        f.formulaGroup === "bonus")
  ).length;
}

/**
 * Turn off per-person formulas from the old hardcoded schema (no actor_id).
 * Kelola Orang is the only supported path for bagi hasil / kasbon / bonus.
 * Idempotent — safe to call on each summary load.
 */
export async function disableLegacyOrphanActorFormulas(): Promise<number> {
  const orphans = (await listFormulas()).filter(
    (f) =>
      f.enabled &&
      !f.actorId &&
      (f.formulaGroup === "profit_share" ||
        f.formulaGroup === "cash_advance" ||
        f.formulaGroup === "bonus")
  );
  if (orphans.length === 0) return 0;

  for (const f of orphans) {
    await upsertFormula({ ...f, enabled: false });
  }
  return orphans.length;
}
