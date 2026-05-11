import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/services/auth-service";
import { createSession } from "@/lib/session";
import { apiError } from "@/lib/api-error";
import { limitOrPass, loginLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function loginStatus(errorMessage: string): number {
  if (errorMessage.includes("diperlukan")) return 400;
  if (errorMessage.includes("tidak aktif")) return 403;
  if (
    errorMessage.includes("tidak ditemukan") ||
    errorMessage.includes("Password salah") ||
    errorMessage.includes("Username tidak")
  )
    return 401;
  return 500;
}

export async function POST(request: NextRequest) {
  try {
    const limited = await limitOrPass(loginLimiter, request, "login");
    if (!limited.ok) {
      return apiError("Too many attempts", 429);
    }

    const { username, password } = await request.json();

    const result = await login(username, password);

    if (!result.success || !result.user) {
      const msg = result.error || "Login gagal";
      return NextResponse.json({ error: msg }, { status: loginStatus(msg) });
    }

    await createSession(result.user.id, result.user.role);

    return NextResponse.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    return apiError("Terjadi kesalahan saat login", 500, error);
  }
}
