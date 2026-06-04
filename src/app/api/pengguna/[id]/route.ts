import { NextRequest, NextResponse } from "next/server";
import { deleteProfil, patchProfil } from "@/lib/services/users-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    const body = await request.json();

    const user = await patchProfil(paramId, body);

    if (!user) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    if (error?.message === "Tidak ada perubahan") {
      return NextResponse.json(
        { error: "Tidak ada perubahan" },
        { status: 400 }
      );
    }
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengupdate user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    let nama_pengguna: string | undefined;
    try {
      const body = await request.json();
      nama_pengguna = body?.nama_pengguna;
    } catch {
      /* empty body */
    }

    const ok = await deleteProfil(paramId, nama_pengguna);
    if (!ok) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus user" },
      { status: 500 }
    );
  }
}
