"use client";

/**
 * Halaman Kelola Pengurus telah dipindahkan ke modal Pengaturan Keuangan.
 * Halaman ini hanya menyediakan redirect agar bookmark / URL eksternal
 * tetap berfungsi.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KelolaPengurusRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/keuangan");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
      <div className="text-center space-y-3 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-blue-600 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <p className="text-slate-600 text-sm">
          Fitur Kelola Pengurus sekarang ada di <strong>Keuangan → Pengaturan → Pengurus</strong>.
        </p>
        <p className="text-slate-400 text-xs">Mengalihkan…</p>
      </div>
    </div>
  );
}
