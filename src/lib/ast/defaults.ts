/**
 * Default seed formulas for the cashbook AST engine.
 *
 * Only the 5 system-wide formulas (Omzet, Biaya Operasional, Biaya Bahan,
 * Saldo, Laba Bersih) ship as defaults. Per-person formulas (kasbon,
 * bagi hasil, bonus) are created dynamically from the "Kelola Orang" UI,
 * so a fresh install starts with no real names anywhere.
 *
 * Legacy fields `column` (G/H/I/J/K) and `dbColumn` remain populated so
 * existing UI/recalc code keeps working during the migration window. New
 * code should reference formulas by `formulaKey` (semantic).
 *
 * Mapping legacy letter → formulaKey → keuangan DB column:
 *   G → omzet              → omzet
 *   H → biaya_operasional  → biaya_operasional
 *   I → biaya_bahan        → biaya_bahan
 *   J → saldo              → saldo
 *   K → laba_bersih        → laba_bersih
 *
 * Legacy person-specific formulas (Kasbon Suri, Bagi Hasil Suri, Bagi
 * Hasil Gemi, Kasbon Cahaya) used to be seeded here as well. They were
 * removed as part of the finance scalability refactor — the same shapes
 * are now generated on-demand by `formula-service.ts` when a user adds
 * a business_actor with the corresponding role.
 */

import type {
  ASTNode,
  FormulaDefinition,
  PartnerDefinition,
} from "./types";

const lit = (value: string | number | boolean): ASTNode => ({
  type: "literal",
  value,
});
const col = (c: "C" | "D" | "E" | "F"): ASTNode => ({
  type: "columnRef",
  column: c,
});
const prev = (c: string): ASTNode => ({ type: "prevOutput", column: c });
const cur = (c: string): ASTNode => ({ type: "outputRef", column: c });
const row = (): ASTNode => ({ type: "row" });
const search = (find: ASTNode, within: ASTNode): ASTNode => ({
  type: "search",
  find,
  within,
});
const iserror = (arg: ASTNode): ASTNode => ({ type: "iserror", arg });
const not = (arg: ASTNode): ASTNode => ({ type: "not", arg });
const or = (left: ASTNode, right: ASTNode): ASTNode => ({
  type: "or",
  left,
  right,
});
const iff = (cond: ASTNode, t: ASTNode, e: ASTNode): ASTNode => ({
  type: "if",
  cond,
  then: t,
  else: e,
});
const op = (
  o: "+" | "-" | "*" | "/" | "=" | "<>" | ">" | "<" | ">=" | "<=",
  l: ASTNode,
  r: ASTNode
): ASTNode => ({ type: "binaryOp", op: o, left: l, right: r });

const isFirstRow = (): ASTNode => op("=", row(), lit(2));

/**
 * Default partners. Intentionally empty — partners (real people) are added
 * by the user through the "Kelola Orang" UI, never seeded by code. The
 * export is kept so callers that still import it stay compile-safe.
 */
export const DEFAULT_PARTNERS: PartnerDefinition[] = [];

/**
 * G: OMZET
 *   =IF(OR(NOT(ISERROR(SEARCH("OMZET",C))), NOT(ISERROR(SEARCH("PIUTANG",C)))),
 *        IF(ROW()=2, D, G_prev + D),
 *        IF(ROW()=2, 0, G_prev))
 */
const astOmzet: ASTNode = iff(
  or(
    not(iserror(search(lit("OMZET"), col("C")))),
    not(iserror(search(lit("PIUTANG"), col("C"))))
  ),
  iff(isFirstRow(), col("D"), op("+", prev("G"), col("D"))),
  iff(isFirstRow(), lit(0), prev("G"))
);

/**
 * H: BIAYA OPERASIONAL
 *   =IF(ROW()=2, 0, IF(OR(C="BIAYA",C="TABUNGAN"), H_prev + E, H_prev))
 */
const astBiayaOps: ASTNode = iff(
  isFirstRow(),
  iff(
    or(op("=", col("C"), lit("BIAYA")), op("=", col("C"), lit("TABUNGAN"))),
    col("E"),
    lit(0)
  ),
  iff(
    or(op("=", col("C"), lit("BIAYA")), op("=", col("C"), lit("TABUNGAN"))),
    op("+", prev("H"), col("E")),
    prev("H")
  )
);

/**
 * I: BIAYA BAHAN
 *   =IF(ROW()=2, 0, IF(OR(C="SUPPLY",C="HUTANG"), I_prev + E, I_prev))
 */
const astBiayaBahan: ASTNode = iff(
  isFirstRow(),
  iff(
    or(op("=", col("C"), lit("SUPPLY")), op("=", col("C"), lit("HUTANG"))),
    col("E"),
    lit(0)
  ),
  iff(
    or(op("=", col("C"), lit("SUPPLY")), op("=", col("C"), lit("HUTANG"))),
    op("+", prev("I"), col("E")),
    prev("I")
  )
);

/**
 * J: SALDO
 *   =IF(ROW()=2, D - E, J_prev + D - E)
 */
const astSaldo: ASTNode = iff(
  isFirstRow(),
  op("-", col("D"), col("E")),
  op("-", op("+", prev("J"), col("D")), col("E"))
);

/**
 * K: LABA BERSIH
 *   = G - (H + I)
 */
const astLabaBersih: ASTNode = op(
  "-",
  cur("G"),
  op("+", cur("H"), cur("I"))
);

/**
 * L: MODAL KAS
 *   Akumulasi running balance dari transaksi berkategori "KAS" saja.
 *   = IF(C == "KAS",
 *        IF(ROW() == 2, D - E, MK_prev + D - E),
 *        IF(ROW() == 2, 0, MK_prev))
 */
const astModalKas: ASTNode = iff(
  op("=", col("C"), lit("KAS")),
  iff(
    isFirstRow(),
    op("-", col("D"), col("E")),
    op("-", op("+", prev("modal_kas"), col("D")), col("E"))
  ),
  iff(isFirstRow(), lit(0), prev("modal_kas"))
);

/**
 * M: PIUTANG KAS (KASBON)
 *   Akumulasi running balance dari transaksi berkategori "KASBON".
 *   Kasbon keluar = kredit (piutang naik), kasbon dibayar = debit (piutang turun).
 *   = IF(C == "KASBON",
 *        IF(ROW() == 2, E - D, piutang_kas_prev + E - D),
 *        IF(ROW() == 2, 0, piutang_kas_prev))
 */
const astPiutangKas: ASTNode = iff(
  op("=", col("C"), lit("KASBON")),
  iff(
    isFirstRow(),
    op("-", col("E"), col("D")),
    op("-", op("+", prev("piutang_kas"), col("E")), col("D"))
  ),
  iff(isFirstRow(), lit(0), prev("piutang_kas"))
);

/**
 * N: KAS
 *   Total kas perusahaan yang masih di tangan (belum dipinjam).
 *   = Modal Kas - Piutang Kas
 */
const astKas: ASTNode = op(
  "-",
  cur("modal_kas"),
  cur("piutang_kas")
);

export const DEFAULT_FORMULAS: FormulaDefinition[] = [
  {
    id: "formula-g-omzet",
    name: "Omzet",
    column: "G",
    dbColumn: "omzet",
    formulaKey: "omzet",
    formulaGroup: "summary",
    actorId: null,
    ast: astOmzet,
    enabled: true,
    isSystem: true,
    displayOrder: 10,
    description: "Akumulasi penjualan + piutang.",
  },
  {
    id: "formula-h-biaya-ops",
    name: "Biaya Operasional",
    column: "H",
    dbColumn: "biaya_operasional",
    formulaKey: "biaya_operasional",
    formulaGroup: "summary",
    actorId: null,
    ast: astBiayaOps,
    enabled: true,
    isSystem: true,
    displayOrder: 20,
    description: "Akumulasi BIAYA + TABUNGAN.",
  },
  {
    id: "formula-i-biaya-bahan",
    name: "Biaya Bahan",
    column: "I",
    dbColumn: "biaya_bahan",
    formulaKey: "biaya_bahan",
    formulaGroup: "summary",
    actorId: null,
    ast: astBiayaBahan,
    enabled: true,
    isSystem: true,
    displayOrder: 30,
    description: "Akumulasi SUPPLY + HUTANG.",
  },
  {
    id: "formula-j-saldo",
    name: "Saldo",
    column: "J",
    dbColumn: "saldo",
    formulaKey: "saldo",
    formulaGroup: "summary",
    actorId: null,
    ast: astSaldo,
    enabled: true,
    isSystem: true,
    displayOrder: 40,
    description: "Saldo kas berjalan (debit − kredit).",
  },
  {
    id: "formula-k-laba",
    name: "Laba Bersih",
    column: "K",
    dbColumn: "laba_bersih",
    formulaKey: "laba_bersih",
    formulaGroup: "summary",
    actorId: null,
    ast: astLabaBersih,
    enabled: true,
    isSystem: true,
    displayOrder: 50,
    description: "Omzet − (Biaya Operasional + Biaya Bahan).",
  },
  {
    id: "formula-modal-kas",
    name: "Modal Kas",
    column: "modal_kas",
    dbColumn: "modal_kas",
    formulaKey: "modal_kas",
    formulaGroup: "summary",
    actorId: null,
    ast: astModalKas,
    enabled: true,
    isSystem: true,
    displayOrder: 60,
    description: "Akumulasi running balance dari transaksi berkategori KAS.",
  },
  {
    id: "formula-piutang-kas",
    name: "Piutang Kas",
    column: "piutang_kas",
    dbColumn: "piutang_kas",
    formulaKey: "piutang_kas",
    formulaGroup: "summary",
    actorId: null,
    ast: astPiutangKas,
    enabled: true,
    isSystem: true,
    displayOrder: 70,
    description: "Total kasbon aktif yang sedang dipinjam pengurus.",
  },
  {
    id: "formula-kas",
    name: "Kas",
    column: "kas",
    dbColumn: "kas",
    formulaKey: "kas",
    formulaGroup: "summary",
    actorId: null,
    ast: astKas,
    enabled: true,
    isSystem: true,
    displayOrder: 80,
    description: "Total kas perusahaan: Modal Kas + Piutang Kas.",
  },
];

/** Deep clone helper for callers that intend to mutate seeded values. */
export function cloneDefaults<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
