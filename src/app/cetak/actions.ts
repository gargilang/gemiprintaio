"use server";

import { embedGemiprintFontsInHtml } from "@/lib/print-fonts-server";
import { requireSession } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";

/** Sisipkan font branding base64 ke HTML cetak (andalan Firefox/Zen). */
export async function embedPrintFontsAction(html: string): Promise<string> {
  try {
    await requireSession();
    return embedGemiprintFontsInHtml(html);
  } catch (err) {
    if (err instanceof AuthGuardError) throw err;
    throw err;
  }
}
