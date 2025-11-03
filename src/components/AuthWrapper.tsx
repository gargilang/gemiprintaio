"use client";

import { useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requireAuth, User } from "@/lib/auth-helper";

interface AuthWrapperProps {
  children: (user: User) => ReactNode;
  fallback?: ReactNode;
}

/**
 * Auth Wrapper Component
 * Wraps pages that require authentication
 * Automatically redirects to login if not authenticated
 */
export default function AuthWrapper({ children, fallback }: AuthWrapperProps) {
  const router = useRouter();
  const user = requireAuth(router);

  useEffect(() => {
    requireAuth(router);
  }, [router]);

  if (!user) {
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

  return <>{children(user)}</>;
}
