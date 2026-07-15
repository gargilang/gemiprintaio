"use client";

/**
 * Error boundary area Piutang. Menampilkan pesan ramah dan tombol Coba Lagi.
 */
export default function ErrorPiutang({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 text-center">
        <p className="font-semibold text-slate-800 dark:text-slate-100">
          Gagal memuat halaman Piutang.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {error.message || "Terjadi kesalahan tak terduga."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
        >
          Coba Lagi
        </button>
      </div>
    </div>
  );
}
