/**
 * Supabase client helpers (server-side only)
 *
 * Extracted from db-unified.ts. Contains:
 *   - Server-side Supabase client singleton (getServerSupabaseClient)
 *   - Browser Supabase client singleton (getSupabaseClient) — kept here
 *     because it shares the same import and is used only through
 *     UnifiedDatabase methods that already live in db-unified.ts.
 *   - Online-status helpers (isOnline, isServerSupabaseAvailable)
 *   - Supabase column-introspection cache (getServerSupabaseTableColumns)
 *
 * IMPORTANT: do NOT import from db-unified.ts here — would be circular.
 */

import "server-only";

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { WEB_SERVER_MEDIATED_ONLY } from "./sync-config";

// ── Re-export environment helpers used by both sqlite and unified ────────────
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function isTauriApp(): boolean {
  if (!isBrowser()) return false;
  return "__TAURI__" in window;
}

export function isServerSide(): boolean {
  return !isBrowser();
}

// ── Browser Supabase client ──────────────────────────────────────────────────
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isBrowser() || WEB_SERVER_MEDIATED_ONLY) return null;

  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      console.warn("⚠️ Supabase not configured");
      return null;
    }

    supabaseClient = createClient(url, anonKey);
  }

  return supabaseClient;
}

// ── Server-side Supabase client ──────────────────────────────────────────────
let serverSupabaseClient: SupabaseClient | null = null;

/** Exported for server-side services that need PostgREST directly (Vercel / Supabase-only paths). */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (!isServerSide()) return null;

  if (!serverSupabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !serviceKey) {
      console.warn("⚠️ Server Supabase not configured");
      return null;
    }

    serverSupabaseClient = createClient(url, serviceKey);
    console.info("✅ Server-side Supabase connected");
  }

  return serverSupabaseClient;
}

// ── Online-status helpers ────────────────────────────────────────────────────
let onlineStatus: boolean | null = null;
let lastOnlineCheck = 0;
export const ONLINE_CHECK_INTERVAL = 5000; // 5 seconds

export async function isOnline(): Promise<boolean> {
  if (!isBrowser()) return false;

  const now = Date.now();
  if (onlineStatus !== null && now - lastOnlineCheck < ONLINE_CHECK_INTERVAL) {
    return onlineStatus;
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase
      .from("profil")
      .select("id")
      .limit(1)
      .single();

    onlineStatus = !error;
    lastOnlineCheck = now;
    return onlineStatus;
  } catch {
    onlineStatus = false;
    lastOnlineCheck = now;
    return false;
  }
}

// ── Server-side health-check ─────────────────────────────────────────────────
let serverOnlineStatus: boolean | null = null;
let lastServerOnlineCheck = 0;

/**
 * Whether to skip the per-process Supabase health check ping.
 *
 * On Vercel (or any serverless host) every cold function would otherwise
 * issue an extra `SELECT id FROM profil LIMIT 1` before the real query,
 * adding ~100-300 ms of round trip latency. When VERCEL=1 or the env flag
 * GEMIPRINT_SKIP_SUPABASE_HEALTHCHECK=1 is set we assume Supabase is
 * available and fall back to SQLite only if the actual query errors.
 */
export function shouldSkipServerHealthCheck(): boolean {
  if (process.env.GEMIPRINT_SKIP_SUPABASE_HEALTHCHECK === "1") return true;
  if (process.env.VERCEL === "1") return true;
  return false;
}

export async function isServerSupabaseAvailable(): Promise<boolean> {
  if (!isServerSide()) return false;

  if (shouldSkipServerHealthCheck()) {
    const supabase = getServerSupabaseClient();
    return !!supabase;
  }

  const now = Date.now();
  if (
    serverOnlineStatus !== null &&
    now - lastServerOnlineCheck < ONLINE_CHECK_INTERVAL
  ) {
    return serverOnlineStatus;
  }

  try {
    const supabase = getServerSupabaseClient();
    if (!supabase) return false;

    const { error } = await supabase.from("profil").select("id").limit(1);

    serverOnlineStatus = !error;
    lastServerOnlineCheck = now;

    if (serverOnlineStatus) {
      console.info("🌐 Supabase online - using cloud database");
    } else {
      if (error) {
        console.warn("📴 Supabase profil check failed:", error.message, error);
      }
      console.info("📴 Supabase offline - using local SQLite");
    }

    return serverOnlineStatus;
  } catch (err) {
    console.info("📴 Supabase connection failed - using local SQLite");
    serverOnlineStatus = false;
    lastServerOnlineCheck = now;
    return false;
  }
}

// ── Supabase column-introspection cache ──────────────────────────────────────
/**
 * Server-side Supabase column introspection cache.
 *
 * Used when local SQLite is disabled (Vercel / web dev) and we still need
 * to filter the payload to columns that actually exist in the cloud
 * schema. Strategy: sample one row from the table; PostgREST returns
 * every column even when the row's value is null. If the table happens
 * to be empty the sample returns nothing — caller falls back to sending
 * the unfiltered payload, which Postgres will reject with a clear error.
 */
export const serverSupabaseColumnsCache = new Map<string, Set<string>>();

export async function getServerSupabaseTableColumns(
  table: string
): Promise<Set<string>> {
  const cached = serverSupabaseColumnsCache.get(table);
  if (cached) return cached;

  const supabase = getServerSupabaseClient();
  if (!supabase) return new Set();

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .limit(1);
    if (error) {
      // Table missing from cloud schema or RLS denied — return empty so
      // the caller falls back to the unfiltered path.
      return new Set();
    }
    if (data && data.length > 0) {
      const cols = new Set(Object.keys(data[0] as Record<string, unknown>));
      serverSupabaseColumnsCache.set(table, cols);
      return cols;
    }
  } catch {
    // Network/auth issue — return empty.
  }

  return new Set();
}

export function getPostgrestMissingColumn(error: unknown): string | null {
  const maybeError = error as { code?: string; message?: string } | null;
  if (maybeError?.code !== "PGRST204" || !maybeError.message) return null;

  const match = maybeError.message.match(/'([^']+)'\s+column/);
  return match?.[1] ?? null;
}
