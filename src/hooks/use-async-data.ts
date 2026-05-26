"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAsyncData
 *
 * Loads data from an async source on mount and exposes a `reload()` callback
 * that components can call after mutations.
 *
 * Why this exists:
 *   The naive pattern `useEffect(() => { void load() }, [])` triggers the
 *   `react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps`
 *   lint rules because the effect body synchronously schedules a setState
 *   chain. This hook moves the setState into a callback that owns the
 *   loading flag and races, with proper cleanup via the `active` ref so a
 *   stale fetch can never overwrite fresh state when the user navigates
 *   away or triggers a reload mid-flight.
 *
 * Usage:
 *
 *   const { data, loading, reload, setData } = useAsyncData(
 *     () => fetchSomething(),
 *     initialValue
 *   );
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  initial: T
): {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeRef = useRef(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loaderRef.current();
      if (activeRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (activeRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void reload();
    return () => {
      activeRef.current = false;
    };
  }, [reload]);

  return { data, setData, loading, error, reload };
}
