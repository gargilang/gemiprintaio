import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/services/users-service";
import { apiError } from "@/lib/api-error";
import { limitOrPass, registerLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await limitOrPass(registerLimiter, request, "register");
  if (!limited.ok) {
    return apiError("Too many attempts", 429);
  }

  try {
    const { nama_pengguna, email, nama_lengkap, password } =
      await request.json();

    const { id } = await createUser({
      nama_pengguna,
      email,
      nama_lengkap,
      password,
      role: "user",
      aktif_status: 0,
    });

    return NextResponse.json(
      {
        success: true,
        id,
        message:
          "Pendaftaran diterima. Menunggu persetujuan administrator sebelum dapat login.",
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Pendaftaran gagal";
    if (
      message.includes("wajib") ||
      message.includes("Nama pengguna") ||
      message.includes("Email")
    ) {
      return NextResponse.json(
        { error: message },
        { status: message.includes("wajib") ? 400 : 409 }
      );
    }
    return apiError("Pendaftaran gagal", 500, error);
  }
}
