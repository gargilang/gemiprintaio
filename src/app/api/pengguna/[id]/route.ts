import { NextRequest, NextResponse } from "next/server";
import { deleteProfil, patchProfil } from "@/lib/services/users-service";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminOrManager();
    const { id: paramId } = await params;
    const body = await request.json();

    // Cegah admin menurunkan role dirinya sendiri (hindari kehilangan admin terakhir).
    if (
      paramId === session.uid &&
      body?.role &&
      body.role !== "admin" &&
      session.role === "admin"
    ) {
      return NextResponse.json(
        { error: "Tidak bisa menurunkan role admin diri sendiri" },
        { status: 400 }
      );
    }

    const user = await patchProfil(paramId, body);

    if (!user) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    await logAudit({
      userId: session.uid,
      action: "update_pengguna",
      resourceType: "profil",
      resourceId: paramId,
      details: { fields: Object.keys(body || {}) },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
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
    const session = await requireAdminOrManager();
    const { id: paramId } = await params;

    // Cegah hapus akun sendiri.
    if (paramId === session.uid) {
      return NextResponse.json(
        { error: "Tidak bisa menghapus akun sendiri" },
        { status: 400 }
      );
    }

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

    await logAudit({
      userId: session.uid,
      action: "delete_pengguna",
      resourceType: "profil",
      resourceId: paramId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus user" },
      { status: 500 }
    );
  }
}
