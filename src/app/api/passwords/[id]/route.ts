import { NextRequest, NextResponse } from "next/server";
import {
  deleteCredential,
  getDecryptedPassword,
  updateCredential,
} from "@/lib/services/credentials-service";
import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const viewerId = request.headers.get("x-session-uid") || undefined;
    const { id } = await params;

    try {
      const password = await getDecryptedPassword(id, viewerId);
      return NextResponse.json({ password });
    } catch (e: any) {
      if (e?.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Credential tidak ditemukan" },
          { status: 404 }
        );
      }
      if (e?.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
      }
      throw e;
    }
  } catch (error) {
    console.error("GET /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil password" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const viewerId = session.uid;
    const { id } = await params;
    const body = await request.json();

    try {
      await updateCredential(id, viewerId, {
        nama_layanan: body.nama_layanan,
        nama_pengguna_akun: body.nama_pengguna_akun,
        password: body.password,
        catatan: body.catatan,
        privat_status: body.privat_status,
      });
    } catch (e: any) {
      if (e?.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Credential tidak ditemukan" },
          { status: 404 }
        );
      }
      if (e?.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
      }
      if (e?.message === "NO_CHANGES") {
        return NextResponse.json(
          { error: "Tidak ada perubahan" },
          { status: 400 }
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal update kredensial" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const viewerId = session.uid;
    const { id } = await params;

    try {
      await deleteCredential(id, viewerId);
    } catch (e: any) {
      if (e?.message === "NOT_FOUND") {
        return NextResponse.json(
          { error: "Credential tidak ditemukan" },
          { status: 404 }
        );
      }
      if (e?.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus kredensial" },
      { status: 500 }
    );
  }
}
