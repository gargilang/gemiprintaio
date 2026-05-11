import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUser } from "@/lib/services/users-service";
import { apiError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.uid) {
      return apiError("Unauthorized", 401);
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
