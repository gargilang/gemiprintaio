/** Buang token [REF:xxx] dari teks tampilan (tetap tersimpan utuh di database). */
export function stripReferenceId(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s*\[REF:[^\]]+\]/g, "").trim();
}
