"use client";

import useSWR, { type SWRConfiguration, type SWRResponse } from "swr";
import { useCallback } from "react";
import { useSWRConfig } from "swr";

/**
 * Pembungkus tipis SWR untuk kasus umum di mana data datang dari Server Action
 * Next.js, bukan dari URL.
 *
 * Pemakaian:
 *
 *   const { data: pelanggan, isLoading, mutate, refresh } =
 *     useCachedData("pelanggan", () => getPelangganAction());
 *
 * Catatan:
 * - `key` harus berupa string yang stabil dan unik secara global (mis. "pelanggan",
 *   `pelanggan:${id}`). Itulah yang menandai entri cache.
 * - Fetcher harus mengembalikan nilai yang bisa di-JSON.stringify supaya
 *   bisa disimpan di localStorage.
 * - Provider di `swr-provider.tsx` menampilkan nilai terakhir yang diketahui
 *   secara instan saat paint pertama, jadi kebanyakan halaman tidak menampilkan
 *   spinner setelah load pertama.
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
 * Hook yang mengembalikan mutator SWR global. Berguna untuk invalidasi cache
 * dari handler mutasi, mis.:
 *
 *   const invalidate = useInvalidate();
 *   await createPelangganAction(form);
 *   invalidate("pelanggan");
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
