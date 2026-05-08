import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import crypto from "crypto";

// Simple hash function for password verification
async function simpleHash(text: string): Promise<string> {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username dan password diperlukan" },
        { status: 400 }
      );
    }

    const db = await getDatabaseAsync();

    // Get user by username
    const user = db
      .prepare(
        `
      SELECT id, nama_pengguna, email, nama_lengkap, role, aktif_status, password_hash
      FROM profil
      WHERE nama_pengguna = ?
    `
      )
      .get(username) as any;

    if (!user) {
      return NextResponse.json(
        { error: "Username tidak ditemukan" },
        { status: 401 }
      );
    }

    if (!user.aktif_status) {
      return NextResponse.json(
        { error: "Akun tidak aktif. Hubungi administrator." },
        { status: 403 }
      );
    }

    const passwordHash = await simpleHash(password);

    if (user.password_hash !== passwordHash) {
      return NextResponse.json({ error: "Password salah" }, { status: 401 });
    }

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
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
