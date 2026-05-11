import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUser } from "@/lib/services/users-service";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * Returns the current user. By default this is served from the signed JWT
 * (no DB roundtrip) so page navigations stay fast. Older sessions issued
 * before user info was embedded in the JWT will transparently fall back to
 * a single DB lookup. Clients can also pass ?refresh=1 to force a DB
 * lookup (used after the user updates their own profile).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.uid) {
      return apiError("Unauthorized", 401);
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";
    const hasEmbeddedUser = !!session.nama_pengguna;

    if (hasEmbeddedUser && !forceRefresh) {
      const res = NextResponse.json({
        user: {
          id: session.uid,
          nama_pengguna: session.nama_pengguna ?? "",
          email: session.email ?? null,
          nama_lengkap: session.nama_lengkap ?? null,
          role: session.role,
          aktif_status: 1,
        },
      });
      res.headers.set(
        "Cache-Control",
        "private, max-age=0, stale-while-revalidate=300"
      );
      return res;
    }

    const user = await getUser(session.uid);
    if (!user || !user.aktif_status) {
      return apiError("Unauthorized", 401);
    }

    return NextResponse.json({
      user: {
        id: user.id,
        nama_pengguna: user.nama_pengguna,
        email: user.email,
        nama_lengkap: user.nama_lengkap,
        role: user.role,
        aktif_status: user.aktif_status,
      },
    });
  } catch (e) {
    return apiError("Gagal memuat sesi", 500, e);
  }
}
