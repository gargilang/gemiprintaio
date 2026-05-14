import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "gp_session";

function getEncodedSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw) {
    throw new Error("SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(raw);
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export type SessionUserClaims = {
  uid: string;
  role: string;
  nama_pengguna: string;
  email?: string | null;
  nama_lengkap?: string | null;
};

/**
 * Backward-compatible session creation (uid + role only).
 * Prefer createSessionWithUser when full user data is available.
 */
export async function createSession(userId: string, role: string) {
  return createSessionWithUser({
    uid: userId,
    role,
    nama_pengguna: "",
  });
}

/**
 * Create session JWT with full user info embedded.
 * Lets /api/auth/me return user data without hitting the DB.
 */
export async function createSessionWithUser(
  user: SessionUserClaims,
  options?: { skipCookie?: boolean }
): Promise<string> {
  const jwt = await new SignJWT({
    uid: user.uid,
    role: user.role,
    nama_pengguna: user.nama_pengguna,
    email: user.email ?? null,
    nama_lengkap: user.nama_lengkap ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getEncodedSecret());

  if (!options?.skipCookie) {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, jwt, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
  }

  return jwt;
}

export type SessionPayload = {
  uid: string;
  role: string;
  nama_pengguna?: string;
  email?: string | null;
  nama_lengkap?: string | null;
};

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getEncodedSecret());
    const uid = payload.uid as string | undefined;
    const role = payload.role as string | undefined;
    if (!uid || !role) return null;
    return {
      uid,
      role,
      nama_pengguna: (payload.nama_pengguna as string | undefined) ?? undefined,
      email: (payload.email as string | null | undefined) ?? undefined,
      nama_lengkap:
        (payload.nama_lengkap as string | null | undefined) ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
