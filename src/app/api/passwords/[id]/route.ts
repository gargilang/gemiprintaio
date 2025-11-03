import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initializeDatabase } from "@/lib/sqlite-db";
import { encryptText, decryptText } from "@/lib/crypto";

function ensureTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      account_username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      notes TEXT,
      is_private INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// GET single credential password
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const { id } = await params;
    const db = await initializeDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    ensureTable(db);

    const existing = db
      .prepare(
        `SELECT id, owner_id, password_encrypted, is_private FROM credentials WHERE id = ?`
      )
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Get viewer's role
    const viewer = db
      .prepare(`SELECT id, role FROM profiles WHERE id = ?`)
      .get(viewerId) as any;

    // Check access permission:
    // - Owner can always view
    // - Admin and Manager can view if not private
    // - Regular users can only view their own
    const isOwner = viewerId === existing.owner_id;
    const isAdminOrManager =
      viewer && (viewer.role === "admin" || viewer.role === "manager");
    const isPrivate = existing.is_private === 1;

    if (!isOwner && (!isAdminOrManager || isPrivate)) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const password = decryptText(existing.password_encrypted);
    return NextResponse.json({ password });
  } catch (error) {
    console.error("GET /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengambil password" },
      { status: 500 }
    );
  }
}

// PUT update credential
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const { id } = await params;
    const { service_name, account_username, password, notes, is_private } =
      await request.json();

    const db = await initializeDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    ensureTable(db);

    const existing = db
      .prepare(`SELECT id, owner_id, is_private FROM credentials WHERE id = ?`)
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Privacy rule: if private and viewer != owner, forbid
    if (existing.is_private && viewerId !== existing.owner_id) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (typeof service_name !== "undefined") {
      fields.push("service_name = ?");
      values.push(service_name);
    }
    if (typeof account_username !== "undefined") {
      fields.push("account_username = ?");
      values.push(account_username);
    }
    if (typeof notes !== "undefined") {
      fields.push("notes = ?");
      values.push(notes || "");
    }
    if (typeof is_private !== "undefined") {
      fields.push("is_private = ?");
      values.push(is_private ? 1 : 0);
    }
    if (typeof password !== "undefined" && password !== "") {
      fields.push("password_encrypted = ?");
      values.push(encryptText(password));
    }
    if (fields.length === 0)
      return NextResponse.json(
        { error: "Tidak ada perubahan" },
        { status: 400 }
      );

    const sql = `UPDATE credentials SET ${fields.join(
      ", "
    )}, updated_at = datetime('now') WHERE id = ?`;
    values.push(id);
    db.prepare(sql).run(...values);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal update kredensial" },
      { status: 500 }
    );
  }
}

// DELETE credential
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const { id } = await params;
    const db = await initializeDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    ensureTable(db);

    const existing = db
      .prepare(`SELECT id, owner_id, is_private FROM credentials WHERE id = ?`)
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Only owner can delete; if public, allow admin in future (not implemented now)
    if (viewerId !== existing.owner_id) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    db.prepare(`DELETE FROM credentials WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus kredensial" },
      { status: 500 }
    );
  }
}
