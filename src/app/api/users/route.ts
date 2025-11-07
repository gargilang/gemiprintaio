import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // exclude from static export
import { initializeDatabase } from "@/lib/sqlite-db";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// Keep consistent hashing with login route
async function simpleHash(text: string): Promise<string> {
  return crypto.createHash("sha256").update(text).digest("hex");
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
        `SELECT id, nama_pengguna, email, nama_lengkap, role, aktif_status, dibuat_pada, diperbarui_pada FROM profil ORDER BY dibuat_pada DESC`
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
      nama_pengguna,
      email,
      nama_lengkap,
      password,
      role = "user",
      aktif_status = 1,
    } = await request.json();

    // Email kini opsional: hanya nama_pengguna dan password yang wajib
    if (!nama_pengguna || !password) {
      return NextResponse.json(
        { error: "nama_pengguna dan password wajib diisi" },
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
      .prepare(`SELECT id FROM profil WHERE nama_pengguna = ?`)
      .get(nama_pengguna) as any;
    if (byUsername) {
      return NextResponse.json(
        { error: "Nama pengguna sudah digunakan" },
        { status: 409 }
      );
    }

    if (normalizedEmail) {
      const byEmail = db
        .prepare(`SELECT id FROM profil WHERE email = ?`)
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
      `INSERT INTO profil (id, nama_pengguna, email, nama_lengkap, password_hash, role, aktif_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      nama_pengguna,
      normalizedEmail,
      nama_lengkap || null,
      password_hash,
      role,
      aktif_status ? 1 : 0
    );

    const user = db
      .prepare(
        `SELECT id, nama_pengguna, email, nama_lengkap, role, aktif_status, dibuat_pada, diperbarui_pada FROM profil WHERE id = ?`
      )
      .get(id);

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: "Gagal menambah user" }, { status: 500 });
  }
}
