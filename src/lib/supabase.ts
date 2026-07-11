import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { WEB_SERVER_MEDIATED_ONLY } from "./sync-config";

// Environment detection
function isBrowser() {
  return typeof window !== "undefined";
}

function isTauriApp(): boolean {
  if (!isBrowser()) return false;
  return "__TAURI__" in window;
}

// Get Supabase URL and keys
function getSupabaseConfig() {
  // For browser (web app or Tauri)
  if (isBrowser()) {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    };
  }
  // For server-side (API routes)
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

const config = getSupabaseConfig();

// Validate configuration
if (!config.url || !config.anonKey) {
  console.warn(
    "⚠️ Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

// Client-side Supabase client (using anon key)
// Safe for both Tauri and web app
export const supabase: SupabaseClient = createClient(
  config.url || "https://placeholder.supabase.co",
  config.anonKey || "placeholder-key"
);

/**
 * Browser-side Supabase client is only allowed for Tauri desktop.
 * Web runtime should stay server-mediated.
 */
export function getBrowserSupabaseForTauri(): SupabaseClient | null {
  if (!isBrowser()) return null;
  if (!isTauriApp() && WEB_SERVER_MEDIATED_ONLY) return null;
  if (!config.url || !config.anonKey) return null;
  return supabase;
}

// Server-side Supabase client (service role) sekarang ada di
// `@/lib/supabase-admin` yang ditandai `server-only`, supaya kredensial
// service-role tidak pernah ikut ke bundle browser (lihat S-I5).

// Check if Supabase is available (online mode)
export async function isSupabaseAvailable(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profil").select("count").limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

// Tables aligned with database/sqlite-schema.sql / supabase/schema.sql (sync layer may use a subset)
export const SYNC_TABLES = [
  "kategori_barang",
  "subkategori_barang",
  "satuan_barang",
  "spesifikasi_cepat_barang",
  "barang",
  "harga_barang_satuan",
  "opsi_finishing",
  "pelanggan",
  "vendor",
  "profil",
  "kredensial",
  "penjualan",
  "item_penjualan",
  "penawaran",
  "item_penawaran",
  "pembelian",
  "item_pembelian",
  "purchase_orders",
  "purchase_order_items",
  "retur_penjualan",
  "item_retur_penjualan",
  "retur_pembelian",
  "item_retur_pembelian",
  "stock_opnames",
  "stock_opname_items",
  "inventory_movements",
  "piutang_penjualan",
  "pelunasan_piutang",
  "hutang_pembelian",
  "pelunasan_hutang",
  "order_produksi",
  "item_produksi",
  "item_finishing",
  "keuangan",
  "notifikasi",
  "notifikasi_pengguna",
];

export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
  timestamp: string;
  details?: {
    table: string;
    synced: number;
    errors: number;
  }[];
}
