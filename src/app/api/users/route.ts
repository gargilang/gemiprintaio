import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // exclude from static export
import { initializeDatabase } from "@/lib/sqlite-db";
import { v4 as uuidv4 } from "uuid";

// Keep consistent hashing with login route
async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  try {
    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    const users = db
      .prepare(
        `SELECT id, username, email, full_name, role, is_active, created_at, updated_at FROM profiles ORDER BY created_at DESC`
      )
      .all();

    return NextResponse.json({ users });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Gagal memuat users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const {
      username,
      email,
      full_name,
      password,
      role = "user",
      is_active = 1,
    } = await request.json();

    // Email kini opsional: hanya username dan password yang wajib
    if (!username || !password) {
      return NextResponse.json(
        { error: "username dan password wajib diisi" },
        { status: 400 }
      );
    }

    // Normalisasi email: kosong -> null
    const normalizedEmail: string | null =
      email && String(email).trim() ? String(email).trim() : null;

    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Uniqueness checks
    const byUsername = db
      .prepare(`SELECT id FROM profiles WHERE username = ?`)
      .get(username) as any;
    if (byUsername) {
      return NextResponse.json(
        { error: "Username sudah digunakan" },
        { status: 409 }
      );
    }

    if (normalizedEmail) {
      const byEmail = db
        .prepare(`SELECT id FROM profiles WHERE email = ?`)
        .get(normalizedEmail) as any;
      if (byEmail) {
        return NextResponse.json(
          { error: "Email sudah digunakan" },
          { status: 409 }
        );
      }
    }

    const id = uuidv4();
    const password_hash = await simpleHash(password);

    db.prepare(
      `INSERT INTO profiles (id, username, email, full_name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      username,
      normalizedEmail,
      full_name || null,
      password_hash,
      role,
      is_active ? 1 : 0
    );

    const user = db
      .prepare(
        `SELECT id, username, email, full_name, role, is_active, created_at, updated_at FROM profiles WHERE id = ?`
      )
      .get(id);

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: "Gagal menambah user" }, { status: 500 });
  }
}
