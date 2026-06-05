import Link from "next/link";

/**
 * Halaman 404 global App Router. Tampil saat route tidak ditemukan atau
 * notFound() dipanggil.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
      <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
        Halaman tidak ditemukan
      </h2>
      <p className="text-slate-600 dark:text-slate-400 max-w-md">
        Halaman yang Anda cari tidak ada atau sudah dipindahkan.
      </p>
      <Link
        href="/beranda"
        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
      >
        Kembali ke Beranda
      </Link>
    </div>
  );
}
