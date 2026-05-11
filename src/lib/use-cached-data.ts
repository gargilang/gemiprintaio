"use client";

import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";
import { useCallback } from "react";
import { useSWRConfig } from "swr";

/**
 * Thin wrapper around SWR for the common case where data comes from a Next.js
 * Server Action rather than a URL.
 *
 * Usage:
 *
 *   const { data: customers, isLoading, mutate, refresh } =
 *     useCachedData("customers", () => getCustomersAction());
 *
 * Notes:
 * - `key` should be a stable, globally unique string (e.g. "customers",
 *   `customer:${id}`). It is what tags the cache entry.
 * - The fetcher must return a value that JSON.stringify can handle so it can
 *   be persisted in localStorage.
 * - The provider in `swr-provider.tsx` shows the last known value instantly
 *   on first paint, so most pages will not display a spinner after the very
 *   first load.
 */
export function useCachedData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  config?: SWRConfiguration<T>
): SWRResponse<T> & { refresh: () => Promise<T | undefined> } {
  const swr = useSWR<T>(key, fetcher, config);

  const refresh = useCallback(async () => {
    return swr.mutate();
  }, [swr]);

  return { ...swr, refresh };
}

/**
 * Hook returning the global SWR mutator. Useful for invalidating cache from
 * mutation handlers, e.g.:
 *
 *   const invalidate = useInvalidate();
 *   await createCustomerAction(form);
 *   invalidate("customers");
 */
export function useInvalidate() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (key: string, data?: unknown) => {
      return mutate(key, data, data === undefined ? undefined : { revalidate: false });
    },
    [mutate]
  );
}
