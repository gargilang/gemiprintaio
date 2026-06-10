/**
 * Penentu label target Supabase (lokal vs cloud) dari env URL.
 *
 * Dipakai untuk log yang akurat: dulu log selalu bilang "cloud database"
 * padahal bisa jadi Supabase lokal (127.0.0.1:54321). Deteksi host dari
 * NEXT_PUBLIC_SUPABASE_URL sudah cukup membedakannya.
 */

/** Benar bila URL Supabase menunjuk ke instance lokal (localhost/127.0.0.1). */
export function isLocalSupabaseUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

/** Label sumber data Supabase aktif: "lokal" atau "cloud". */
export function supabaseTargetLabel(): "lokal" | "cloud" {
  return isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
    ? "lokal"
    : "cloud";
}
