/**
 * Static metadata for every visual formula node.
 *
 * Keeps labels (Indonesian, user-facing) + handle definitions in one place so
 * the palette + the renderer share a single source of truth.
 */

export type NodeKind =
  | "literal"
  | "columnRef"
  | "prevOutput"
  | "outputRef"
  | "partnerRef"
  | "row"
  | "search"
  | "iserror"
  | "not"
  | "negate"
  | "and"
  | "or"
  | "if"
  | "binaryOp"
  | "output";

export interface NodeDef {
  kind: NodeKind;
  /** Indonesian label shown in the palette + on the node header. */
  label: string;
  /** Free-form helper text shown as a tooltip / palette subtitle. */
  description: string;
  /** Tailwind colour used for the node header accent. */
  color: string;
  /** Logical group used to bucket palette entries. */
  group: "logika" | "matematika" | "referensi" | "konstanta" | "khusus";
  /** Target handles (inputs) accepted by this node. */
  inputs: string[];
  /** Whether the node emits a value (almost always true). */
  hasOutput: boolean;
}

export const NODE_DEFS: Record<NodeKind, NodeDef> = {
  literal: {
    kind: "literal",
    label: "Konstanta",
    description: "Angka, teks, atau benar/salah.",
    color: "bg-emerald-500",
    group: "konstanta",
    inputs: [],
    hasOutput: true,
  },
  columnRef: {
    kind: "columnRef",
    label: "Kolom transaksi",
    description: "Nilai kolom C, D, E, atau F pada baris saat ini.",
    color: "bg-sky-500",
    group: "referensi",
    inputs: [],
    hasOutput: true,
  },
  prevOutput: {
    kind: "prevOutput",
    label: "Nilai baris sebelumnya",
    description: "Nilai kolom hasil pada baris sebelumnya.",
    color: "bg-indigo-500",
    group: "referensi",
    inputs: [],
    hasOutput: true,
  },
  outputRef: {
    kind: "outputRef",
    label: "Nilai kolom hasil",
    description: "Nilai kolom hasil lain pada baris saat ini.",
    color: "bg-indigo-400",
    group: "referensi",
    inputs: [],
    hasOutput: true,
  },
  partnerRef: {
    kind: "partnerRef",
    label: "Mitra",
    description: "Nama mitra dari daftar global.",
    color: "bg-fuchsia-500",
    group: "referensi",
    inputs: [],
    hasOutput: true,
  },
  row: {
    kind: "row",
    label: "Nomor baris",
    description: "Nomor baris saat ini (baris pertama = 2).",
    color: "bg-slate-500",
    group: "referensi",
    inputs: [],
    hasOutput: true,
  },
  search: {
    kind: "search",
    label: "SEARCH",
    description: "Mencari teks (case-insensitive). Error bila tidak ditemukan.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-find", "in-within"],
    hasOutput: true,
  },
  iserror: {
    kind: "iserror",
    label: "ISERROR",
    description: "Bernilai BENAR bila simpul di dalamnya error.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-arg"],
    hasOutput: true,
  },
  not: {
    kind: "not",
    label: "NOT",
    description: "Membalik benar/salah.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-arg"],
    hasOutput: true,
  },
  negate: {
    kind: "negate",
    label: "Negasi",
    description: "Mengubah tanda angka (mis. 5 → −5).",
    color: "bg-rose-500",
    group: "matematika",
    inputs: ["in-arg"],
    hasOutput: true,
  },
  and: {
    kind: "and",
    label: "AND",
    description: "BENAR bila kedua sisi BENAR.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-left", "in-right"],
    hasOutput: true,
  },
  or: {
    kind: "or",
    label: "OR",
    description: "BENAR bila minimal satu sisi BENAR.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-left", "in-right"],
    hasOutput: true,
  },
  if: {
    kind: "if",
    label: "IF",
    description: "Pilih nilai berdasarkan kondisi.",
    color: "bg-amber-500",
    group: "logika",
    inputs: ["in-cond", "in-then", "in-else"],
    hasOutput: true,
  },
  binaryOp: {
    kind: "binaryOp",
    label: "Operasi",
    description: "Hitungan dua nilai: + − × ÷ atau perbandingan.",
    color: "bg-rose-500",
    group: "matematika",
    inputs: ["in-left", "in-right"],
    hasOutput: true,
  },
  output: {
    kind: "output",
    label: "Hasil",
    description: "Nilai akhir formula.",
    color: "bg-emerald-600",
    group: "khusus",
    inputs: ["in-value"],
    hasOutput: false,
  },
};

export const NODE_GROUPS: Array<{
  id: NodeDef["group"];
  title: string;
  kinds: NodeKind[];
}> = [
  {
    id: "konstanta",
    title: "Konstanta",
    kinds: ["literal"],
  },
  {
    id: "referensi",
    title: "Referensi",
    kinds: ["columnRef", "prevOutput", "outputRef", "partnerRef", "row"],
  },
  {
    id: "logika",
    title: "Logika",
    kinds: ["if", "and", "or", "not", "iserror", "search"],
  },
  {
    id: "matematika",
    title: "Matematika",
    kinds: ["binaryOp", "negate"],
  },
];

export const BINARY_OP_OPTIONS = [
  { value: "+", label: "+ (tambah)" },
  { value: "-", label: "− (kurang)" },
  { value: "*", label: "× (kali)" },
  { value: "/", label: "÷ (bagi)" },
  { value: "=", label: "= (sama dengan)" },
  { value: "<>", label: "≠ (tidak sama)" },
  { value: ">", label: "> (lebih dari)" },
  { value: "<", label: "< (kurang dari)" },
  { value: ">=", label: "≥ (lebih atau sama)" },
  { value: "<=", label: "≤ (kurang atau sama)" },
] as const;
