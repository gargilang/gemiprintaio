/**
 * Feature flag untuk mengaktifkan RPC Postgres atomik (composite mutation
 * penjualan/pembelian) di mode Supabase-only (web/Vercel).
 *
 * - Tauri (SQLite lokal) SELALU pakai transaksi SQLite nyata, jadi flag ini
 *   tidak relevan dan dikembalikan false.
 * - Default NONAKTIF (opt-in). Set `USE_PG_COMPOSITE_RPC=1` untuk mengaktifkan
 *   RPC atomik SETELAH migrasi RPC ter-deploy & diverifikasi di Supabase.
 *   Sampai itu, jalur lama dipakai dengan compensating cleanup sebagai
 *   pelindung (lihat pos-mutations / purchases-mutations).
 *
 * Catatan keamanan: RPC penjualan (`create_sale_with_inventory`) belum punya
 * paritas fitur penuh dengan jalur TS (maklon auto-PO, roll deferral,
 * biaya_tambahan). JANGAN aktifkan untuk penjualan sampai paritas dikonfirmasi.
 */
export function usePgCompositeRpc(): boolean {
  if (process.env.TAURI === "true" || process.env.TAURI === "1") return false;
  return process.env.USE_PG_COMPOSITE_RPC === "1";
}
