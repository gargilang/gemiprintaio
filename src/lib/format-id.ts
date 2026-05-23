/**
 * Indonesian formatting helpers (Rupiah currency + Asia/Jakarta dates).
 *
 * These are intentionally stateless and safe to use both server- and
 * client-side. They centralize the repeated `Intl.NumberFormat("id-ID", IDR)`
 * and `toLocaleDateString("id-ID", ...)` patterns that are duplicated across
 * dashboard, finance, reports, POS, and print templates.
 */

const RUPIAH_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
});

const RUPIAH_NUMBER_FORMATTER = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * Format a number as IDR currency, e.g. `Rp 150.000`.
 * Returns `Rp 0` for null/undefined/NaN inputs.
 */
export function formatRupiah(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return RUPIAH_FORMATTER.format(n);
}

/**
 * Format a number as a plain Indonesian-grouped number (no `Rp` prefix),
 * e.g. `150.000`. Useful inside table cells where the column header already
 * says "Rp".
 */
export function formatRupiahPlain(amount: number | null | undefined): string {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return RUPIAH_NUMBER_FORMATTER.format(n);
}

/**
 * Format an ISO/Date input as a long Indonesian date in Asia/Jakarta,
 * e.g. `23 Mei 2026`.
 */
export function formatJakartaDate(input: string | Date | null | undefined): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return LONG_DATE_FORMATTER.format(d);
}

/**
 * Format an ISO/Date input as a short Indonesian date in Asia/Jakarta,
 * e.g. `23 Mei 2026`.
 */
export function formatJakartaShortDate(
  input: string | Date | null | undefined
): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return SHORT_DATE_FORMATTER.format(d);
}

/**
 * Format an ISO/Date input as a short Indonesian datetime in Asia/Jakarta,
 * e.g. `23 Mei 2026 14:30`.
 */
export function formatJakartaDateTime(
  input: string | Date | null | undefined
): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return DATETIME_FORMATTER.format(d);
}
