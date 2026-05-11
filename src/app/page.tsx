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
        router.push("/dashboard");
      } else {
        router.push("/auth/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1b3d] via-[#2266ff] to-[#00afef]">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
        <p className="mt-4 text-white font-semibold">Loading...</p>
      </div>
    </div>
  );
}
