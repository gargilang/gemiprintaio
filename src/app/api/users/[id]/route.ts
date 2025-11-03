import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // exclude from static export
import { initializeDatabase } from "@/lib/sqlite-db";

// Keep hashing consistent with login
async function simpleHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paramId } = await params;
    let id = paramId;
    const { email, full_name, role, is_active, password, username } =
      await request.json();

    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    // Ensure user exists
    let existing = db
      .prepare(`SELECT id FROM profiles WHERE id = ?`)
      .get(id) as any;
    if (!existing && username) {
      // Fallback by username (helps migrate from legacy localStorage ids)
      const byUsername = db
        .prepare(`SELECT id FROM profiles WHERE username = ?`)
        .get(username) as any;
      if (byUsername) {
        id = byUsername.id;
        existing = byUsername;
      }
    }
    if (!existing) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    // Build dynamic update
    const fields: string[] = [];
    const values: any[] = [];

    if (typeof email !== "undefined") {
      fields.push("email = ?");
      values.push(email);
    }
    if (typeof full_name !== "undefined") {
      fields.push("full_name = ?");
      values.push(full_name || null);
    }
    if (typeof role !== "undefined") {
      fields.push("role = ?");
      values.push(role);
    }
    if (typeof is_active !== "undefined") {
      fields.push("is_active = ?");
      values.push(is_active ? 1 : 0);
    }
    if (password) {
      fields.push("password_hash = ?");
      values.push(await simpleHash(password));
    }

    if (fields.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada perubahan" },
        { status: 400 }
      );
    }

    const sql = `UPDATE profiles SET ${fields.join(
      ", "
    )}, updated_at = datetime('now') WHERE id = ?`;
    values.push(id);
    db.prepare(sql).run(...values);

    const user = db
      .prepare(
        `SELECT id, username, email, full_name, role, is_active, created_at, updated_at FROM profiles WHERE id = ?`
      )
      .get(id);

    return NextResponse.json({ success: true, user });
  } catch (error) {
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
    let id = paramId;
    let username: string | undefined;
    try {
      const body = await request.json();
      username = body?.username;
    } catch {}
    const db = await initializeDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    }

    let existing = db
      .prepare(`SELECT id FROM profiles WHERE id = ?`)
      .get(id) as any;
    if (!existing && username) {
      const byUsername = db
        .prepare(`SELECT id FROM profiles WHERE username = ?`)
        .get(username) as any;
      if (byUsername) {
        id = byUsername.id;
        existing = byUsername;
      }
    }
    if (!existing) {
      return NextResponse.json(
        { error: "User tidak ditemukan" },
        { status: 404 }
      );
    }

    db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus user" },
      { status: 500 }
    );
  }
}
