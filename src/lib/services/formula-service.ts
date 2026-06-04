/**
 * formula-service (v2)
 *
 * Generator formula AST generik untuk perhitungan yang digerakkan actor.
 * Menggantikan logika berbasis-slot hardcoded di profit-share-config.ts /
 * cashbook-config-sync.ts dengan satu aturan: setiap business_actor yang
 * peran-nya punya grup bertipe calc otomatis mendapat cashbook_formula
 * yang cocok dengan `formula_key`, `actor_id`, dan `formula_group` semantik.
 *
 * Tiga pola didukung sekarang; pola baru ditambahkan dengan extending
 * dispatch di `syncFormulasForActor`:
 *
 *   profit_share  → persentase dari laba_bersih (opsional dikurangi kasbon)
 *   cash_advance  → ledger berjalan dari kategori + keperluan match
 *   bonus         → persentase dari formula lain (mis. omzet)
 *
 * Sistem column-letter legacy tetap operasional di samping ini: formula
 * yang di-generate otomatis mengambil huruf baru dari rentang nomor tinggi
 * (P, Q, R, …) supaya hidup berdampingan dengan formula G–K yang di-seed
 * tanpa tabrakan.
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
 *   nilai = sourceFormula × (percent / 100)
 *
 * Dipakai untuk bonus penjualan ("Bonus 5% Omzet") dan pola profit_share
 * v2 saat hanya persentase yang diberikan (tanpa penyesuaian kasbon).
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
 *   nilai = laba_bersih × (percent / 100) − kasbon_<actor>
 *
 * Kalau `kasbonFormulaKey` null kita degradasi ke percentage_of_formula biasa.
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
 *   Kalau kategori baris ada di `categories` DAN (tidak ada keyword ATAU keperluan match),
 *     kontribusi baris = (D ? prev - D : prev + E)
 *   Kalau tidak, lanjutkan prev.
 *
 * List kategori WAJIB tidak kosong. Keyword opsional, mencocokkan substring
 * dengan `keperluan` (case-insensitive, lewat SEARCH/ISERROR).
 */
function astCashAdvanceLedger(
  formulaKey: string,
  categories: string[],
  keperluanKeyword: string | null
): ASTNode {
  // Bangun (C = cat1) ATAU (C = cat2) ATAU ...
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
 * Pilih huruf kolom baru untuk formula yang di-generate dari actor. Sistem
 * huruf legacy masih dipakai oleh editor UI dan graf formula yang ada.
 * Formula actor baru hidup di rentang P..Z; kalau itu pernah penuh kita
 * jatuh balik ke AA, AB, ... (tidak ada batas atas riil).
 */
function nextColumnLetter(used: Set<string>): string {
  const candidates = [
    "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  ];
  for (const c of candidates) {
    if (!used.has(c)) return c;
  }
  // Lanjut ke AA, AB, …
  for (let i = 0; i < 26 * 26; i++) {
    const code = `A${String.fromCharCode(65 + i)}`;
    if (!used.has(code)) return code;
  }
  return `X${Date.now().toString(36).toUpperCase()}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface SyncFormulasResult {
  created: string[];   // nilai formula_key yang dibuat
  updated: string[];   // nilai formula_key yang diperbarui di tempat
  removed: string[];   // nilai formula_key yang dilepas
}

/**
 * Diberi sebuah actor, periksa field calc-nya dan pastikan cashbook_formula
 * memiliki tepat set formula yang menempel padanya.
 *
 * Peran murni label jabatan — TIDAK membatasi tipe formula yang bisa dimiliki
 * actor. Generasi formula sepenuhnya digerakkan oleh field mana yang
 * non-null/non-empty di baris actor:
 *
 *   profit_share_percent IS NOT NULL  → upsert "bagi_hasil_<slug>"
 *   cash_advance_categories non-empty → upsert "kasbon_<slug>"
 *   bonus_percent IS NOT NULL         → upsert "bonus_<slug>"
 *
 * Satu actor boleh punya ketiganya sekaligus (mis. managing director yang
 * menerima profit share, punya cash advance, DAN bonus penjualan).
 *
 * Saat actor nonaktif, semua formula tertaut di-disable (tidak dihapus).
 */
export async function syncFormulasForActor(
  actorId: string
): Promise<SyncFormulasResult> {
  const result: SyncFormulasResult = { created: [], updated: [], removed: [] };

  const actor = await getBusinessActor(actorId);
  if (!actor) return result;

  const allFormulas = await listFormulas();
  const existing = allFormulas.filter((f) => f.actorId === actorId);

  // Saat actor nonaktif, disable semua formula tertaut alih-alih menghapus,
  // supaya data recalc historis tetap valid.
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

  // Bangun set lengkap yang diinginkan dari field mana pun yang terisi.
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

  // Hapus (disable) formula yang sudah tidak ada di set yang diinginkan.
  for (const f of existing) {
    if (!desiredKeys.has(f.formulaKey ?? "")) {
      await upsertFormula({ ...f, enabled: false });
      if (f.formulaKey) result.removed.push(f.formulaKey);
    }
  }

  // Upsert tiap formula yang diinginkan, gunakan ulang slot huruf yang ada kalau bisa.
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

/** Jalankan ulang sync untuk setiap actor aktif (dipakai setelah rebalance persen massal). */
export async function syncAllActiveActorFormulas(
  actorIds: string[]
): Promise<void> {
  await Promise.all(actorIds.map((id) => syncFormulasForActor(id)));
}

/** Display order dasar supaya grup terurut konsisten di list formula. */
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

/** Convenience: muat satu formula berdasarkan key semantiknya. */
export async function getFormulaByKey(
  formulaKey: string
): Promise<FormulaDefinition | null> {
  const all = await listFormulas();
  return all.find((f) => (f.formulaKey ?? f.dbColumn) === formulaKey) ?? null;
}

/** List formula di salah satu grup v2 (Ringkasan / Bagi Hasil / Kasbon / Bonus / Kustom). */
export async function listFormulasByGroup(
  group: FormulaGroup
): Promise<FormulaDefinition[]> {
  const all = await listFormulas();
  return all
    .filter((f) => (f.formulaGroup ?? "custom") === group && f.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Snapshot formula yang dikelompokkan berdasarkan formula_group v2-nya.
 * Convenience untuk bar UI baru.
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

/** Satu kolom di tabel ringkasan per-actor yang dinamis. */
export interface ActorSummaryColumn {
  formulaKey: string;
  label: string;
  group: FormulaGroup;
}

/** Satu baris untuk tabel Keuangan v2 — semua metrik untuk satu orang dalam satu baris. */
export interface ActorFinanceSummaryRow {
  actorId: string | null;
  displayName: string;
  roleLabel: string;
  /** Map formula_key → nilai numerik (atau null kalau tidak berlaku). */
  metrics: Record<string, number | null>;
  displayOrder: number;
  /** True kalau baris ini adalah formula global (tanpa business_actor tertaut). */
  isGlobal: boolean;
}

export interface ActorFinanceSummary {
  /** Kolom yang akan dirender, dalam urutan yang seharusnya tampil. */
  columns: ActorSummaryColumn[];
  /** Baris per-actor ditambah blok terakhir formula custom global kalau ada. */
  rows: ActorFinanceSummaryRow[];
}

/**
 * Bangun feed ringkasan per-actor dinamis. Set kolom diturunkan dari formula
 * dengan `is_visible_in_summary = true` ditambah urutan kanonik yang stabil
 * (Bagi Hasil → Kasbon → Bonus → Kustom). Baris dengan `actor_id` masuk blok
 * actor; baris custom yang terlihat tanpa actor menjadi baris "(global)".
 *
 * Pass pre-fetched `actors`, `roles`, and `formulas` to avoid redundant DB
 * round-trips when the caller already has this data (e.g. summary-v2 route).
 */
export async function getActorFinanceSummary(
  valuesByKey: Record<string, number>,
  prefetched?: {
    actors?: import("@/lib/services/business-actor-service").BusinessActor[];
    roles?: import("@/lib/services/business-actor-service").ActorRole[];
    formulas?: import("@/lib/ast/types").FormulaDefinition[];
  }
): Promise<ActorFinanceSummary> {
  const [actors, roles, formulas] = await Promise.all([
    prefetched?.actors ?? listBusinessActors({ includeInactive: false }),
    prefetched?.roles ?? listActorRoles(),
    prefetched?.formulas ?? listFormulas(),
  ]);

  const roleLabelByCode = new Map(roles.map((r) => [r.role_code, r.role_label]));
  const visibleFormulas = formulas.filter(
    (f) => f.enabled && f.isVisibleInSummary
  );

  // Bangun set kolom secara deterministik. Urutan grup mengikuti UI:
  // profit_share → cash_advance → bonus → custom (summary dikecualikan; itu
  // sudah hidup di card di atas tabel).
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

  // Untuk agregasi per-baris, kita masih perlu tahu key formula mana yang
  // milik actor mana (supaya tiap actor hanya menampilkan metriknya sendiri).
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

  // Bangun baris per-actor. Sel akan null kalau actor tidak punya formula
  // untuk key itu (supaya UI bisa render "—" alih-alih 0).
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

  // Tambahkan formula custom global sebagai baris mandiri supaya metrik
  // user-defined yang tidak menempel ke orang tetap muncul di panel.
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
 * Adapter legacy yang dipertahankan sampai pemanggil UI bermigrasi ke `getActorFinanceSummary`.
 *
 * @deprecated Lebih baik pakai `getActorFinanceSummary` — dia mengembalikan
 *             kolom adaptif yang digerakkan oleh `is_visible_in_summary`
 *             alih-alih layout tiga-slot hardcoded.
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

/** Hitung formula bertipe actor yang aktif tapi tidak ditautkan ke business_actor mana pun. */
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
 * Matikan formula per-orang dari skema hardcoded lama (tanpa actor_id).
 * Kelola Orang adalah satu-satunya jalur yang didukung untuk bagi hasil / kasbon / bonus.
 * Idempoten — aman dipanggil di setiap load summary.
 *
 * Kirim list `formulas` yang sudah di-prefetch untuk menghindari round-trip DB
 * tambahan saat pemanggil sudah punya list formula lengkap.
 */
export async function disableLegacyOrphanActorFormulas(
  formulas?: FormulaDefinition[]
): Promise<number> {
  const all = formulas ?? (await listFormulas());
  const orphans = all.filter(
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
