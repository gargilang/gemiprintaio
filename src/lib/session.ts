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

export async function createSession(userId: string, role: string) {
  const jwt = await new SignJWT({ uid: userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getEncodedSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export type SessionPayload = { uid: string; role: string };

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getEncodedSecret());
    const uid = payload.uid as string | undefined;
    const role = payload.role as string | undefined;
    if (!uid || !role) return null;
    return { uid, role };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
