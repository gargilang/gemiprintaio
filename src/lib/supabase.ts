import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

// Client-side Supabase client (using anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (using service role key for sync operations)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
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
