/**
 * Slugify nama menjadi identifier aman (huruf kecil, alfanumerik, underscore).
 * Dipakai untuk membentuk formula_key bagi-hasil/kasbon/bonus dari nama actor.
 *
 * Berada di file utilitas murni (tanpa import server) supaya aman dipakai
 * dari komponen klien ("use client") maupun service server.
 */
export function slugifyActorName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || `actor_${Date.now().toString(36)}`
  );
}
