import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "gp_session";

function extractBearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

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

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (
    host.startsWith("app.gemiprint.com") &&
    !pathname.startsWith("/api/") &&
    MOBILE_UA.test(request.headers.get("user-agent") ?? "")
  ) {
    return NextResponse.redirect("https://m.gemiprint.com" + pathname);
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

  const token =
    request.cookies.get(SESSION_COOKIE)?.value ??
    extractBearerToken(request.headers.get("authorization"));
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
