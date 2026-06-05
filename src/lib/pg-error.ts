/**
 * Terjemahkan error PostgREST/Postgres ke pesan Bahasa Indonesia yang ramah,
 * tanpa membocorkan nama constraint internal (info disclosure ringan) — D-I6.
 *
 * Pakai di service mutation menggantikan `throw new Error(error.message)` yang
 * menampilkan pesan EN mentah seperti "duplicate key value violates unique
 * constraint penjualan_nomor_faktur_key" ke notifikasi UI.
 */
type PgLikeError = { code?: string; message?: string };

export function friendlyPgError(e: unknown, table?: string): string {
  const err = (e || {}) as PgLikeError;
  const ctx = table ? ` (${table})` : "";
  switch (err.code) {
    case "23505":
      return `Nomor atau data sudah dipakai${ctx}. Coba lagi.`;
    case "23503":
      return `Data terkait sudah dihapus atau tidak ditemukan${ctx}.`;
    case "23514":
      return `Data tidak memenuhi aturan validasi${ctx}.`;
    case "23502":
      return `Ada kolom wajib yang kosong${ctx}.`;
    default:
      return `Terjadi kesalahan saat menyimpan data${ctx}.`;
  }
}
