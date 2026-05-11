"use client";

import { ReactNode, useEffect, useMemo } from "react";
import { SWRConfig } from "swr";

const PERSIST_KEY = "gp_swr_cache_v1";
const PERSIST_DEBOUNCE_MS = 800;
const MAX_PERSIST_BYTES = 4 * 1024 * 1024; // ~4 MB cap on localStorage payload

type CacheValue = { data?: unknown; error?: unknown };

/**
 * Persistent SWR cache.
 *
 * - Initial map is hydrated from localStorage so revisiting a page shows the
 *   last known data instantly (no spinner).
 * - Writes are debounced to avoid blocking the main thread.
 * - Only successful data is persisted; errors are stripped.
 * - Total payload size is capped so localStorage never overflows.
 */
function createPersistentMap(): Map<string, CacheValue> {
  if (typeof window === "undefined") {
    return new Map<string, CacheValue>();
  }

  let map = new Map<string, CacheValue>();
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Array<[string, CacheValue]>;
      if (Array.isArray(parsed)) {
        map = new Map(parsed);
      }
    }
  } catch {
    /* corrupt cache; ignore */
  }

  let persistTimer: number | null = null;
  const schedulePersist = () => {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      try {
        const entries: Array<[string, CacheValue]> = [];
        for (const [key, value] of map) {
          if (!value || typeof value !== "object") continue;
          if (value.error) continue;
          if (typeof value.data === "undefined") continue;
          entries.push([key, { data: value.data }]);
        }
        let serialized = JSON.stringify(entries);
        if (serialized.length > MAX_PERSIST_BYTES) {
          // Drop oldest entries until we fit; Map preserves insertion order.
          const trimmed = entries.slice(
            Math.max(0, entries.length - Math.floor(entries.length / 2))
          );
          serialized = JSON.stringify(trimmed);
        }
        localStorage.setItem(PERSIST_KEY, serialized);
      } catch {
        /* quota exceeded or serialization failure: drop silently */
      }
    }, PERSIST_DEBOUNCE_MS);
  };

  const originalSet = map.set.bind(map);
  map.set = (key, value) => {
    const result = originalSet(key, value);
    schedulePersist();
    return result;
  };
  const originalDelete = map.delete.bind(map);
  map.delete = (key) => {
    const result = originalDelete(key);
    schedulePersist();
    return result;
  };
  const originalClear = map.clear.bind(map);
  map.clear = () => {
    originalClear();
    schedulePersist();
  };

  return map;
}

let persistentMap: Map<string, CacheValue> | null = null;

function getPersistentMap(): Map<string, CacheValue> {
  if (!persistentMap) {
    persistentMap = createPersistentMap();
  }
  return persistentMap;
}

/**
 * Clears the persistent SWR cache. Call on logout so the next user does not
 * see another user's data on first paint.
 */
export function clearSwrCache(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
  persistentMap = null;
}

export function SwrProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(() => () => getPersistentMap(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === PERSIST_KEY && event.newValue === null) {
        persistentMap = null;
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <SWRConfig
      value={{
        provider,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        revalidateIfStale: true,
        dedupingInterval: 10_000,
        focusThrottleInterval: 30_000,
        keepPreviousData: true,
        errorRetryCount: 2,
        errorRetryInterval: 3_000,
        shouldRetryOnError: (err: unknown) => {
          const status = (err as { status?: number } | null)?.status;
          if (status === 401 || status === 403) return false;
          return true;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
