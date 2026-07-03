"use client";

import { useEffect } from "react";

export default function PengambilanError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Pengambilan error:", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        Gagal memuat halaman Pengambilan
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {error.message || "Terjadi kesalahan tak terduga."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
      >
        Coba Lagi
      </button>
    </div>
  );
}
