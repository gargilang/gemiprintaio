/**
 * Formula default seed untuk engine AST buku kas.
 *
 * Hanya 5 formula sistem (Omzet, Biaya Operasional, Biaya Bahan,
 * Saldo, Laba Bersih) yang dikirim sebagai default. Formula per-orang (kasbon,
 * bagi hasil, bonus) dibuat dinamis dari UI "Kelola Orang", jadi instalasi
 * fresh dimulai tanpa nama nyata di mana pun.
 *
 * Field legacy `column` (G/H/I/J/K) dan `dbColumn` tetap diisi supaya
 * kode UI/recalc yang ada tetap jalan selama window migrasi. Kode baru
 * sebaiknya merujuk formula via `formulaKey` (semantik).
 *
 * Mapping huruf legacy → formulaKey → kolom DB keuangan:
 *   G → omzet              → omzet
 *   H → biaya_operasional  → biaya_operasional
 *   I → biaya_bahan        → biaya_bahan
 *   J → saldo              → saldo
 *   K → laba_bersih        → laba_bersih
 *
 * Formula legacy spesifik-orang (kasbon dan bagi hasil per individu)
 * dulu juga di-seed di sini. Mereka sudah dihapus sebagai bagian dari
 * refactor skalabilitas keuangan — bentuk yang sama sekarang
 * di-generate on-demand oleh `formula-service.ts`
 * saat pengguna menambah business_actor dengan peran terkait.
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
const isReturPenjualan = (): ASTNode =>
  or(
    op("=", col("C"), lit("RETUR_PENJUALAN")),
    op("=", col("C"), lit("RETUR_PENJUALAN_NONCASH"))
  );

/**
 * Partner default. Sengaja kosong — partner (orang sungguhan) ditambahkan
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
    or(
      not(iserror(search(lit("OMZET"), col("C")))),
      not(iserror(search(lit("PIUTANG"), col("C"))))
    ),
    isReturPenjualan()
  ),
  iff(
    isFirstRow(),
    iff(
      isReturPenjualan(),
      op("-", lit(0), col("E")),
      col("D")
    ),
    iff(
      isReturPenjualan(),
      op("-", prev("G"), col("E")),
      op("+", prev("G"), col("D"))
    )
  ),
  iff(isFirstRow(), lit(0), prev("G"))
);

/**
 * H: BIAYA OPERASIONAL
 *   =IF(ROW()=2, 0, IF(OR(C="BIAYA",C="TABUNGAN",C="GAJI"), H_prev + E, H_prev))
 * GAJI ikut sebagai beban operasional (penggajian) — mengurangi laba.
 */
const astBiayaOps: ASTNode = iff(
  isFirstRow(),
  iff(
    or(
      or(op("=", col("C"), lit("BIAYA")), op("=", col("C"), lit("TABUNGAN"))),
      op("=", col("C"), lit("GAJI"))
    ),
    col("E"),
    lit(0)
  ),
  iff(
    or(
      or(op("=", col("C"), lit("BIAYA")), op("=", col("C"), lit("TABUNGAN"))),
      op("=", col("C"), lit("GAJI"))
    ),
    op("+", prev("H"), col("E")),
    prev("H")
  )
);

/**
 * I: BIAYA BAHAN / HPP
 *   =IF(ROW()=2, 0, IF(C="HPP", I_prev + E, I_prev))
 * Pembelian tetap sebagai pergerakan kas/inventori; mereka jadi cost saat dijual.
 */
const astBiayaBahan: ASTNode = iff(
  or(op("=", col("C"), lit("HPP")), op("=", col("C"), lit("RETUR_HPP"))),
  iff(
    isFirstRow(),
    iff(
      op("=", col("C"), lit("RETUR_HPP")),
      op("-", lit(0), col("D")),
      col("E")
    ),
    iff(
      op("=", col("C"), lit("RETUR_HPP")),
      op("-", prev("I"), col("D")),
      op("+", prev("I"), col("E"))
    )
  ),
  iff(isFirstRow(), lit(0), prev("I"))
);

/**
 * J: SALDO
 *   Running cash balance. HPP is a non-cash journal entry (it records the
 *   cost of goods sold for profit calculation but does NOT represent actual
 *   cash leaving the register — the cash outflow already happened when
 *   materials were purchased via SUPPLY). So HPP rows are excluded from
 *   the saldo movement.
 *
 *   =IF(C == "HPP",
 *        IF(ROW() == 2, 0, J_prev),          ← HPP: saldo unchanged
 *        IF(ROW() == 2, D - E, J_prev + D - E))  ← all others: normal
 */
const astSaldo: ASTNode = iff(
  or(
    or(op("=", col("C"), lit("HPP")), op("=", col("C"), lit("RETUR_HPP"))),
    op("=", col("C"), lit("RETUR_PENJUALAN_NONCASH"))
  ),
  iff(isFirstRow(), lit(0), prev("J")),
  iff(
    isFirstRow(),
    op("-", col("D"), col("E")),
    op("-", op("+", prev("J"), col("D")), col("E"))
  )
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
 * M: SALDO KASBON
 *   Akumulasi running balance dari transaksi berkategori "PINJAMAN_KARYAWAN".
 *   Kasbon keluar (TARIK) = kredit (saldo naik), kasbon dibayar/dipotong
 *   (BAYAR_TUNAI / POTONG_GAJI) = debit (saldo turun). Cermin dari ledger
 *   pinjaman_karyawan — AST adalah sumber kebenaran kolom buku kas.
 *   = IF(C == "PINJAMAN_KARYAWAN",
 *        IF(ROW() == 2, E - D, saldo_kasbon_prev + E - D),
 *        IF(ROW() == 2, 0, saldo_kasbon_prev))
 */
const astSaldoKasbon: ASTNode = iff(
  op("=", col("C"), lit("PINJAMAN_KARYAWAN")),
  iff(
    isFirstRow(),
    op("-", col("E"), col("D")),
    op("-", op("+", prev("saldo_kasbon"), col("E")), col("D"))
  ),
  iff(isFirstRow(), lit(0), prev("saldo_kasbon"))
);

/**
 * N: KAS
 *   Total kas perusahaan yang masih di tangan (belum dipinjam).
 *   = Modal Kas - Saldo Kasbon
 */
const astKas: ASTNode = op(
  "-",
  cur("modal_kas"),
  cur("saldo_kasbon")
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
    description: "Akumulasi HPP dari barang yang terjual.",
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
    dbColumn: null,
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
    name: "Saldo Kasbon",
    column: "saldo_kasbon",
    dbColumn: null,
    formulaKey: "saldo_kasbon",
    formulaGroup: "summary",
    actorId: null,
    ast: astSaldoKasbon,
    enabled: true,
    isSystem: true,
    displayOrder: 70,
    description: "Total kasbon aktif yang sedang dipinjam karyawan.",
  },
  {
    id: "formula-kas",
    name: "Kas",
    column: "kas",
    dbColumn: null,
    formulaKey: "kas",
    formulaGroup: "summary",
    actorId: null,
    ast: astKas,
    enabled: true,
    isSystem: true,
    displayOrder: 80,
    description: "Total kas perusahaan: Modal Kas − Saldo Kasbon.",
  },
];

/** Helper deep clone untuk pemanggil yang berniat memutasi nilai seed. */
export function cloneDefaults<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
