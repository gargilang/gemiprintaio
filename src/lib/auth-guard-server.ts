import "server-only";

import { getSession, type SessionPayload } from "./session";

export class AuthGuardError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthGuardError";
    this.status = status;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s?.uid) {
    throw new AuthGuardError("Unauthorized", 401);
  }
  return s;
}

export async function requireAdminOrManager(): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.role !== "admin" && s.role !== "manager") {
    throw new AuthGuardError("Forbidden", 403);
  }
  return s;
}

export async function requireAdminManagerOrSelf(
  targetUserId: string
): Promise<SessionPayload> {
  const s = await requireSession();
  if (s.uid === targetUserId) return s;
  if (s.role === "admin" || s.role === "manager") return s;
  throw new AuthGuardError("Forbidden", 403);
}
