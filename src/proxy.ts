import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "gp_session";

function extractBearerToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

/** Origins allowed to call the API from a browser (Flutter web, etc.). */
function isAllowedCorsOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const extras =
    process.env.FLUTTER_WEB_ORIGINS?.split(/[\s,]+/).filter(Boolean) ?? [];
  if (extras.includes(origin)) return true;
  if (origin === "https://m.gemiprint.com") return true;
  if (process.env.NODE_ENV !== "production") {
    try {
      const u = new URL(origin);
      if (
        u.protocol === "http:" &&
        (u.hostname === "localhost" || u.hostname === "127.0.0.1")
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function applyApiCors(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  if (!request.nextUrl.pathname.startsWith("/api/")) return response;
  const origin = request.headers.get("origin");
  if (origin && isAllowedCorsOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept"
    );
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
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
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function getSecret(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET;
  if (!raw) return null;
  return new TextEncoder().encode(raw);
}

let loggedMissingSessionSecret = false;

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  if (
    pathname.startsWith("/_next/static") ||
    pathname.startsWith("/_next/image") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // CORS preflight for Flutter web and other browser clients on another origin.
  if (
    request.method === "OPTIONS" &&
    pathname.startsWith("/api/") &&
    isAllowedCorsOrigin(request.headers.get("origin"))
  ) {
    return applyApiCors(request, new NextResponse(null, { status: 204 }));
  }

  if (
    host.startsWith("app.gemiprint.com") &&
    !pathname.startsWith("/api/") &&
    MOBILE_UA.test(request.headers.get("user-agent") ?? "")
  ) {
    return NextResponse.redirect("https://m.gemiprint.com" + pathname);
  }

  if (isPublicPath(pathname)) {
    return applyApiCors(request, NextResponse.next());
  }

  const secret = getSecret();
  if (!secret) {
    if (!loggedMissingSessionSecret) {
      loggedMissingSessionSecret = true;
      console.warn(
        "[proxy] SESSION_SECRET is not set. Add it to .env.local for local dev (see .env.example). API routes return 503 until it is set."
      );
    }
    if (pathname.startsWith("/api/")) {
      return applyApiCors(
        request,
        NextResponse.json({ error: "Server misconfigured" }, { status: 503 })
      );
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const token =
    request.cookies.get(SESSION_COOKIE)?.value ??
    extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return applyApiCors(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
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

    return applyApiCors(
      request,
      NextResponse.next({
        request: { headers: requestHeaders },
      })
    );
  } catch {
    if (pathname.startsWith("/api/")) {
      return applyApiCors(
        request,
        NextResponse.json({ error: "Session invalid" }, { status: 401 })
      );
    }
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
