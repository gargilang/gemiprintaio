// Helpers for cookie-based session: use /api/auth/me (HTTP-only cookie, not localStorage).

import type { SessionUser } from "./client-session";
import { fetchSessionUser, logoutSession } from "./client-session";

export type User = SessionUser;

export async function getCurrentUserAsync(): Promise<User | null> {
  return fetchSessionUser();
}

export function logout(): void {
  void logoutSession();
}
