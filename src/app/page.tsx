"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchSessionUser } from "@/lib/client-session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await fetchSessionUser();
      if (cancelled) return;
      if (user?.id && user.aktif_status) {
        router.push("/beranda");
      } else {
        router.push("/auth/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* Viewport penuh: tidak di dalam MainShell (lihat layout). Spinner mengikuti gaya loader beranda. */
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <div className="text-center">
        <div
          className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-[#00afef] border-t-transparent"
          aria-hidden
        />
        <p className="mt-4 text-[#0a1b3d] dark:text-slate-100 font-semibold font-twcenmt">Memuat…</p>
      </div>
    </div>
  );
}
