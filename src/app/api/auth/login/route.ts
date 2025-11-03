import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initializeDatabase } from "@/lib/sqlite-db";

// Simple hash function for password verification
async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    console.log("🔐 Login attempt for username:", username);

    if (!username || !password) {
      console.log("❌ Missing username or password");
      return NextResponse.json(
        { error: "Username dan password diperlukan" },
        { status: 400 }
      );
    }

    console.log("📂 Initializing database...");
    const db = await initializeDatabase();
    if (!db) {
      console.log("❌ Database not available");
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    console.log("✅ Database connected");
    console.log("🔍 Looking up user:", username);

    // Get user by username
    const user = db
      .prepare(
        `
      SELECT id, username, email, full_name, role, is_active, password_hash
      FROM profiles
      WHERE username = ?
    `
      )
      .get(username) as any;

    if (!user) {
      console.log("❌ User not found:", username);
      return NextResponse.json(
        { error: "Username tidak ditemukan" },
        { status: 401 }
      );
    }

    console.log("✅ User found:", user.username, "- Role:", user.role);

    if (!user.is_active) {
      console.log("❌ User is not active");
      return NextResponse.json(
        { error: "Akun tidak aktif. Hubungi administrator." },
        { status: 403 }
      );
    }

    // Verify password
    console.log("🔑 Verifying password...");
    const passwordHash = await simpleHash(password);
    console.log("🔑 Generated hash:", passwordHash);
    console.log("🔑 Stored hash:", user.password_hash);
    console.log("🔑 Match:", user.password_hash === passwordHash);

    if (user.password_hash !== passwordHash) {
      console.log("❌ Password mismatch");
      return NextResponse.json({ error: "Password salah" }, { status: 401 });
    }

    console.log("✅ Password verified");

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    console.log("✅ Login successful for:", userWithoutPassword.username);
    return NextResponse.json({
      success: true,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error("💥 Login error:", error);
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
