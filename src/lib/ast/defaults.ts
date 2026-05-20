/**
 * Default seed formulas + partners.
 *
 * Each AST below is the literal translation of the corresponding Google
 * Sheets formula listed in the project brief. Restoring a fresh database
 * with these defaults reproduces the exact behaviour of the old hardcoded
 * calculation engine.
 *
 * Mapping (logical output column → keuangan DB column):
 *   G → omzet
 *   H → biaya_operasional
 *   I → biaya_bahan
 *   J → saldo
 *   K → laba_bersih
 *   L → kasbon_suri
 *   M → bagi_hasil_suri
 *   N → bagi_hasil_gemi
 *   O → kasbon_cahaya
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
const partner = (id: string): ASTNode => ({ type: "partnerRef", partnerId: id });
const search = (find: ASTNode, within: ASTNode): ASTNode => ({
  type: "search",
  find,
  within,
});
const iserror = (arg: ASTNode): ASTNode => ({ type: "iserror", arg });
const not = (arg: ASTNode): ASTNode => ({ type: "not", arg });
const negate = (arg: ASTNode): ASTNode => ({ type: "negate", arg });
const and = (left: ASTNode, right: ASTNode): ASTNode => ({
  type: "and",
  left,
  right,
});
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

/** Default partner records. Cahaya/Suri/Gemi only (Anwar + Dinil removed). */
export const DEFAULT_PARTNERS: PartnerDefinition[] = [
  { id: "partner-cahaya", name: "Cahaya", category: null, displayOrder: 10 },
  { id: "partner-suri", name: "Suri", category: "PRIBADI-S", displayOrder: 20 },
  { id: "partner-gemi", name: "Gemi", category: null, displayOrder: 30 },
];

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
 * L: KASBON SURI
 *   =IF(C="PRIBADI-S",
 *        IF(ROW()=2, IF(D, -D, E), IF(D, L_prev - D, L_prev + E)),
 *        IF(ROW()=2, 0, L_prev))
 */
const astKasbonSuri: ASTNode = iff(
  op("=", col("C"), lit("PRIBADI-S")),
  iff(
    isFirstRow(),
    iff(col("D"), negate(col("D")), col("E")),
    iff(col("D"), op("-", prev("L"), col("D")), op("+", prev("L"), col("E")))
  ),
  iff(isFirstRow(), lit(0), prev("L"))
);

/**
 * M: BAGI HASIL SURI
 *   = (K / 2) - L
 */
const astBagiHasilSuri: ASTNode = op(
  "-",
  op("/", cur("K"), lit(2)),
  cur("L")
);

/**
 * N: BAGI HASIL GEMI
 *   = ((K - IF(ROW()=2, 0, K_prev)) / 2)
 *     + IF(ROW()=2, 0, N_prev)
 *     + IF(C="INVESTOR", D, 0)
 *     - IF(C="INVESTOR", E, 0)
 */
const astBagiHasilGemi: ASTNode = op(
  "-",
  op(
    "+",
    op(
      "+",
      op(
        "/",
        op("-", cur("K"), iff(isFirstRow(), lit(0), prev("K"))),
        lit(2)
      ),
      iff(isFirstRow(), lit(0), prev("N"))
    ),
    iff(op("=", col("C"), lit("INVESTOR")), col("D"), lit(0))
  ),
  iff(op("=", col("C"), lit("INVESTOR")), col("E"), lit(0))
);

/**
 * O: KASBON CAHAYA
 *   =IF(AND(NOT(ISERROR(SEARCH("Cahaya", F))), OR(C="INVESTOR", C="BIAYA")),
 *        IF(ROW()=2, IF(D, -D, E), IF(D, O_prev - D, O_prev + E)),
 *        IF(ROW()=2, 0, O_prev))
 *
 * The literal "Cahaya" is replaced with `partnerRef("partner-cahaya")` so
 * renaming the partner record automatically updates this formula.
 */
const astKasbonCahaya: ASTNode = iff(
  and(
    not(iserror(search(partner("partner-cahaya"), col("F")))),
    or(op("=", col("C"), lit("INVESTOR")), op("=", col("C"), lit("BIAYA")))
  ),
  iff(
    isFirstRow(),
    iff(col("D"), negate(col("D")), col("E")),
    iff(col("D"), op("-", prev("O"), col("D")), op("+", prev("O"), col("E")))
  ),
  iff(isFirstRow(), lit(0), prev("O"))
);

export const DEFAULT_FORMULAS: FormulaDefinition[] = [
  {
    id: "formula-g-omzet",
    name: "Omzet",
    column: "G",
    dbColumn: "omzet",
    ast: astOmzet,
    enabled: true,
    isSystem: false,
    displayOrder: 10,
    description: "Akumulasi penjualan + piutang.",
  },
  {
    id: "formula-h-biaya-ops",
    name: "Biaya Operasional",
    column: "H",
    dbColumn: "biaya_operasional",
    ast: astBiayaOps,
    enabled: true,
    isSystem: false,
    displayOrder: 20,
    description: "Akumulasi BIAYA + TABUNGAN.",
  },
  {
    id: "formula-i-biaya-bahan",
    name: "Biaya Bahan",
    column: "I",
    dbColumn: "biaya_bahan",
    ast: astBiayaBahan,
    enabled: true,
    isSystem: false,
    displayOrder: 30,
    description: "Akumulasi SUPPLY + HUTANG.",
  },
  {
    id: "formula-j-saldo",
    name: "Saldo",
    column: "J",
    dbColumn: "saldo",
    ast: astSaldo,
    enabled: true,
    isSystem: false,
    displayOrder: 40,
    description: "Saldo kas berjalan (debit − kredit).",
  },
  {
    id: "formula-k-laba",
    name: "Laba Bersih",
    column: "K",
    dbColumn: "laba_bersih",
    ast: astLabaBersih,
    enabled: true,
    isSystem: false,
    displayOrder: 50,
    description: "Omzet − (Biaya Operasional + Biaya Bahan).",
  },
  {
    id: "formula-l-kasbon-suri",
    name: "Kasbon Suri",
    column: "L",
    dbColumn: "kasbon_suri",
    ast: astKasbonSuri,
    enabled: true,
    isSystem: false,
    displayOrder: 60,
    description: "Saldo kasbon Suri (kategori PRIBADI-S).",
  },
  {
    id: "formula-m-bagi-hasil-suri",
    name: "Bagi Hasil Suri",
    column: "M",
    dbColumn: "bagi_hasil_suri",
    ast: astBagiHasilSuri,
    enabled: true,
    isSystem: false,
    displayOrder: 70,
    description: "Setengah laba bersih dikurangi kasbon Suri.",
  },
  {
    id: "formula-n-bagi-hasil-gemi",
    name: "Bagi Hasil Gemi",
    column: "N",
    dbColumn: "bagi_hasil_gemi",
    ast: astBagiHasilGemi,
    enabled: true,
    isSystem: false,
    displayOrder: 80,
    description: "Akumulasi kenaikan laba ÷ 2 + transaksi investor.",
  },
  {
    id: "formula-o-kasbon-cahaya",
    name: "Kasbon Cahaya",
    column: "O",
    dbColumn: "kasbon_cahaya",
    ast: astKasbonCahaya,
    enabled: true,
    isSystem: false,
    displayOrder: 90,
    description: "Saldo kasbon Cahaya (transaksi INVESTOR/BIAYA dengan keperluan Cahaya).",
  },
];

/** Deep clone helper for callers that intend to mutate seeded values. */
export function cloneDefaults<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
