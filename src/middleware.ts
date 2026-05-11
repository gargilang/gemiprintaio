import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "gp_session";

const PUBLIC_PREFIXES = [
  "/auth/login",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/_next",
  "/favicon.ico",
  "/assets",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function getSecret(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

let loggedMissingSessionSecret = false;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const secret = getSecret();
  if (!secret) {
    if (!loggedMissingSessionSecret) {
      loggedMissingSessionSecret = true;
      console.warn(
        "[middleware] SESSION_SECRET is not set. Add it to .env.local for local dev (see .env.example). API routes return 503 until it is set."
      );
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const uid = payload.uid as string | undefined;
    const role = payload.role as string | undefined;
    if (!uid || !role) {
      throw new Error("Invalid session payload");
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-session-uid", uid);
    requestHeaders.set("x-session-role", role);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Session invalid" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
