"use client";

import { useEffect } from "react";

/** Error boundary khusus area Keuangan. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        Gagal memuat halaman Keuangan
      </h2>
      <p className="text-slate-600 dark:text-slate-400 max-w-md">
        Terjadi masalah saat membuka Keuangan. Coba lagi; jika berlanjut, muat
        ulang halaman.
      </p>
      <button
        type="button"
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors font-semibold"
      >
        Coba Lagi
      </button>
    </div>
  );
}
