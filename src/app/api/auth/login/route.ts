import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/services/auth-service";

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
    const { username, password } = await request.json();

    const result = await login(username, password);

    if (!result.success || !result.user) {
      const msg = result.error || "Login gagal";
      return NextResponse.json({ error: msg }, { status: loginStatus(msg) });
    }

    return NextResponse.json({
      success: true,
      user: result.user,
    });
  } catch (error) {
    console.error("Login error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Terjadi kesalahan saat login",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
