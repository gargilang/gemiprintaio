"use client";

export interface SessionUser {
  id: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string | null;
  role: string;
  aktif_status: number;
}

const SESSION_USER_KEY = "gp_session_user";
const SESSION_USER_TIMESTAMP_KEY = "gp_session_user_ts";
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

let inflightFetch: Promise<SessionUser | null> | null = null;

function readCachedUser(): { user: SessionUser; ageMs: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    const tsRaw = sessionStorage.getItem(SESSION_USER_TIMESTAMP_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as SessionUser;
    if (!user?.id) return null;
    const ts = tsRaw ? Number(tsRaw) : 0;
    return { user, ageMs: ts ? Date.now() - ts : Number.POSITIVE_INFINITY };
  } catch {
    return null;
  }
}

function writeCachedUser(user: SessionUser | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      sessionStorage.removeItem(SESSION_USER_KEY);
      sessionStorage.removeItem(SESSION_USER_TIMESTAMP_KEY);
      return;
    }
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_USER_TIMESTAMP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Synchronous read of the cached session user, if any.
 * Useful for first paint to avoid showing a loading spinner.
 */
export function getCachedSessionUser(): SessionUser | null {
  return readCachedUser()?.user ?? null;
}

async function fetchSessionUserFromNetwork(
  opts: { refresh?: boolean } = {}
): Promise<SessionUser | null> {
  const url = opts.refresh ? "/api/auth/me?refresh=1" : "/api/auth/me";
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      writeCachedUser(null);
      return null;
    }
    const data = await res.json();
    const user = (data?.user ?? null) as SessionUser | null;
    writeCachedUser(user);
    return user;
  } catch {
    return null;
  }
}

/**
 * Fetch the current session user.
 *
 * Behavior:
 * - If a fresh cached value exists (younger than 5 minutes), returns it
 *   immediately without hitting the network.
 * - If the cache is stale or missing, performs a single network request.
 * - Concurrent callers share the same inflight network request so we never
 *   fire /api/auth/me more than once at a time.
 * - Pass { refresh: true } to bypass cache (used after profile updates).
 */
export async function fetchSessionUser(
  opts: { refresh?: boolean } = {}
): Promise<SessionUser | null> {
  if (!opts.refresh) {
    const cached = readCachedUser();
    if (cached && cached.ageMs < SESSION_CACHE_TTL_MS) {
      return cached.user;
    }
  }

  if (inflightFetch) return inflightFetch;

  inflightFetch = fetchSessionUserFromNetwork(opts).finally(() => {
    inflightFetch = null;
  });

  return inflightFetch;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_USER_TIMESTAMP_KEY);
    localStorage.removeItem("user");
  } catch {
    /* ignore */
  }
  try {
    const { clearSwrCache } = await import("./swr-provider");
    clearSwrCache();
  } catch {
    /* ignore */
  }
}
