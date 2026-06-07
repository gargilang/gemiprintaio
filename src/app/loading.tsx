/**
 * Loading UI global App Router. Tampil otomatis saat segmen route memuat data
 * (Suspense boundary bawaan Next.js).
 * Perubahan di sini tidak memengaruhi deploy Flutter mobile web.
 */
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div
        className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 dark:border-indigo-400"
        role="status"
        aria-label="Memuat"
      />
    </div>
  );
}
