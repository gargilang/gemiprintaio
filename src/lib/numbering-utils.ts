export type NomorFormat = "PREFIX-DATE-SEQ" | "PREFIX-SEQ";
export type NomorReset = "daily" | "monthly" | "yearly" | "never";
export type NomorDateFormat =
  | "YYYYMMDD"
  | "YYMMDD"
  | "DDMMYYYY"
  | "DDMMYY"
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "YYYYMM"
  | "YYMM"
  | "MMYYYY"
  | "MMYY"
  | "DDMM"
  | "MMDD";

export const DEFAULT_NOMOR_DATE_FORMAT: NomorDateFormat = "YYYYMMDD";
export const NOMOR_SEPARATOR = "/";

export const NOMOR_DATE_FORMAT_OPTIONS: Array<{
  value: NomorDateFormat;
  label: string;
}> = [
  { value: "YYYYMMDD", label: "YYYYMMDD" },
  { value: "YYMMDD", label: "YYMMDD" },
  { value: "DDMMYYYY", label: "DDMMYYYY" },
  { value: "DDMMYY", label: "DDMMYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "YYYY/MM/DD", label: "YYYY/MM/DD" },
  { value: "YYYYMM", label: "YYYYMM" },
  { value: "YYMM", label: "YYMM" },
  { value: "MMYYYY", label: "MMYYYY" },
  { value: "MMYY", label: "MMYY" },
  { value: "DDMM", label: "DDMM" },
  { value: "MMDD", label: "MMDD" },
];

const VALID_DATE_FORMATS = new Set<NomorDateFormat>(
  NOMOR_DATE_FORMAT_OPTIONS.map((o) => o.value),
);

export function normalizeNomorDateFormat(value: unknown): NomorDateFormat {
  return VALID_DATE_FORMATS.has(value as NomorDateFormat)
    ? (value as NomorDateFormat)
    : DEFAULT_NOMOR_DATE_FORMAT;
}

function dateParts(tanggal: string): { yyyy: string; yy: string; mm: string; dd: string } {
  const key = String(tanggal || "").slice(0, 10);
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const yyyy = match[1];
    return { yyyy, yy: yyyy.slice(2), mm: match[2], dd: match[3] };
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  return {
    yyyy,
    yy: yyyy.slice(2),
    mm: String(now.getMonth() + 1).padStart(2, "0"),
    dd: String(now.getDate()).padStart(2, "0"),
  };
}

export function formatNomorDatePart(
  tanggal: string,
  format: NomorDateFormat = DEFAULT_NOMOR_DATE_FORMAT,
): string {
  const { yyyy, yy, mm, dd } = dateParts(tanggal);
  switch (normalizeNomorDateFormat(format)) {
    case "YYMMDD":
      return `${yy}${mm}${dd}`;
    case "DDMMYYYY":
      return `${dd}${mm}${yyyy}`;
    case "DDMMYY":
      return `${dd}${mm}${yy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "YYYY/MM/DD":
      return `${yyyy}/${mm}/${dd}`;
    case "YYYYMM":
      return `${yyyy}${mm}`;
    case "YYMM":
      return `${yy}${mm}`;
    case "MMYYYY":
      return `${mm}${yyyy}`;
    case "MMYY":
      return `${mm}${yy}`;
    case "DDMM":
      return `${dd}${mm}`;
    case "MMDD":
      return `${mm}${dd}`;
    case "YYYYMMDD":
    default:
      return `${yyyy}${mm}${dd}`;
  }
}

function resetScopeKey(tanggal: string, reset: NomorReset): string {
  if (reset === "never") return "never";
  const { yyyy, mm, dd } = dateParts(tanggal);
  if (reset === "yearly") return yyyy;
  if (reset === "monthly") return `${yyyy}${mm}`;
  return `${yyyy}${mm}${dd}`;
}

export function sameNomorResetScope(
  a: string | null | undefined,
  b: string,
  reset: NomorReset,
): boolean {
  if (reset === "never") return true;
  if (!a) return false;
  return resetScopeKey(a, reset) === resetScopeKey(b, reset);
}

export function buildNomorUrut(
  prefix: string,
  format: NomorFormat,
  datePart: string,
  seqStr: string,
): string {
  if (format === "PREFIX-DATE-SEQ") {
    return [prefix, datePart, seqStr].join(NOMOR_SEPARATOR);
  }
  return [prefix, seqStr].join(NOMOR_SEPARATOR);
}

export function extractNomorSequence(
  nomor: string | null | undefined,
  prefix: string,
  format: NomorFormat,
): number | null {
  const raw = String(nomor || "");
  const expectedStarts = [`${prefix}${NOMOR_SEPARATOR}`, `${prefix}-`];
  const expectedStart = expectedStarts.find((start) => raw.startsWith(start));
  if (!expectedStart) return null;

  const rest = raw.slice(expectedStart.length);
  const seqStr =
    format === "PREFIX-DATE-SEQ"
      ? rest.slice(Math.max(rest.lastIndexOf(NOMOR_SEPARATOR), rest.lastIndexOf("-")) + 1)
      : rest;
  const seq = parseInt(seqStr, 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}
