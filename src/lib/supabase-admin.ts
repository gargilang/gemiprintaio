import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Klien Supabase dengan service-role key. WAJIB hanya dipanggil dari server
 * (API routes / server actions). `server-only` memastikan modul ini tidak
 * pernah ikut ke bundle browser.
 */
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
