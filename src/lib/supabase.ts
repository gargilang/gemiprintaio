import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

// Server-side Supabase client (using service role key for sync operations)
// Only for API routes (not Tauri)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin credentials not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Check if Supabase is available (online mode)
export async function isSupabaseAvailable(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profil").select("count").limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

// List of tables to sync
export const SYNC_TABLES = [
  "customers",
  "products",
  "materials",
  "material_categories",
  "finish_options",
  "product_attributes",
  "product_materials",
  "product_finish_options",
  "orders",
  "order_items",
  "order_item_options",
  "order_notes",
  "order_status_history",
  "invoices",
  "invoice_items",
  "payments",
  "shipping_addresses",
  "material_inventory",
  "inventory_transactions",
  "production_queue",
  "production_notes",
  "users",
  "activity_logs",
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
