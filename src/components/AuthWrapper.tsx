"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fetchSessionUser, type SessionUser } from "@/lib/client-session";

interface AuthWrapperProps {
  children: (user: SessionUser) => ReactNode;
  fallback?: ReactNode;
}

/**
 * Wraps pages that require authentication (cookie session).
 */
export default function AuthWrapper({ children, fallback }: AuthWrapperProps) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await fetchSessionUser();
      if (cancelled) return;
      if (!u || !u.aktif_status) {
        router.replace("/auth/login");
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(u);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Checking authentication...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children(user)}</>;
}
