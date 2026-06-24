import { embedPrintFontsAction } from "@/app/cetak/actions";

/** Siapkan HTML cetak dengan font embedded via server (fallback ke HTML asli). */
export async function preparePrintHtml(html: string): Promise<string> {
  if (html.includes("data:font/")) return html;
  try {
    return await embedPrintFontsAction(html);
  } catch (err) {
    console.warn("[preparePrintHtml] embed font gagal, pakai HTML asli:", err);
    return html;
  }
}
