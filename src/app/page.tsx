"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Check for user session in localStorage (SQLite offline mode)
    const userSession = localStorage.getItem("user");

    if (userSession) {
      try {
        const user = JSON.parse(userSession);
        if (user && user.id) {
          router.push("/dashboard");
          return;
        }
      } catch (e) {
        // Invalid session, clear it
        localStorage.removeItem("user");
      }
    }

    // No valid session, redirect to login
    router.push("/auth/login");
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
