import { NextRequest, NextResponse } from "next/server";
import {
  createCredential,
  listCredentials,
} from "@/lib/services/credentials-service";
import {
  requireSession,
  requireNotDemo,
  AuthGuardError,
} from "@/lib/auth-guard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const viewerId = request.headers.get("x-session-uid") || undefined;
    const kredensial = await listCredentials(viewerId);
    return NextResponse.json({ kredensial });
  } catch (error) {
    console.error("GET /api/passwords error:", error);
    return NextResponse.json(
      { error: "Gagal memuat kredensial" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireNotDemo(await requireSession());
    const viewerId = session.uid;
    const {
      nama_layanan,
      nama_pengguna_akun,
      password,
      catatan = "",
      privat_status = 1,
    } = await request.json();

    if (!nama_layanan || !nama_pengguna_akun || !password) {
      return NextResponse.json(
        { error: "nama_layanan, nama_pengguna_akun, password wajib diisi" },
        { status: 400 },
      );
    }

    const { id } = await createCredential({
      viewerId,
      nama_layanan,
      nama_pengguna_akun,
      password,
      catatan,
      privat_status,
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("POST /api/passwords error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan kredensial" },
      { status: 500 },
    );
  }
}
