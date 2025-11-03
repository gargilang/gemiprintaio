// Auth Helper for SQLite Offline Mode
// Replace Supabase auth checks with localStorage

export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  role: string;
  is_active: number;
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;

  try {
    const userSession = localStorage.getItem("user");
    if (!userSession) return null;

    const user = JSON.parse(userSession);
    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

/**
 * Check if user has specific role
 */
export function hasRole(role: string): boolean {
  const user = getCurrentUser();
  return user?.role === role;
}

/**
 * Check if user is admin
 */
export function isAdmin(): boolean {
  return hasRole("admin");
}

/**
 * Logout user
 */
export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("user");
  }
}

/**
 * Redirect to login if not authenticated
 * Use this in useEffect
 */
export function requireAuth(router: any): User | null {
  const user = getCurrentUser();

  if (!user) {
    console.log("❌ Not authenticated, redirecting to login");
    router.push("/auth/login");
    return null;
  }

  if (!user.is_active) {
    console.log("❌ User is not active, redirecting to login");
    logout();
    router.push("/auth/login");
    return null;
  }

  console.log("✅ User authenticated:", user.username);
  return user;
}
