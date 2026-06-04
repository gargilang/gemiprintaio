/**
 * Feature flag untuk mengaktifkan RPC Postgres atomik (composite mutation
 * penjualan/pembelian) di mode Supabase-only (web/Vercel).
 *
 * - Tauri (SQLite lokal) SELALU pakai transaksi SQLite nyata, jadi flag ini
 *   tidak relevan dan dikembalikan false.
 * - Default AKTIF di web supaya composite mutation atomik. Set
 *   `USE_PG_COMPOSITE_RPC=0` untuk kembali ke jalur lama (dengan compensating
 *   cleanup) bila RPC belum ter-deploy atau ada masalah.
 */
export function usePgCompositeRpc(): boolean {
  if (process.env.TAURI === "true" || process.env.TAURI === "1") return false;
  return process.env.USE_PG_COMPOSITE_RPC !== "0";
}
