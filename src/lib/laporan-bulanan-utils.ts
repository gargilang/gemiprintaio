/** Format YYYY-MM menjadi label Bahasa Indonesia, misal "2026-06" → "Juni 2026". */
export function formatPeriodKeyLabel(periodKey: string): string {
  const [yearStr, monthStr] = periodKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  return new Date(year, month, 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}
