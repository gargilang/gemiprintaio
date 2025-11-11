import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import { encryptText, decryptText } from "@/lib/crypto";

function ensureTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kredensial (
      id TEXT PRIMARY KEY,
      pemilik_id TEXT NOT NULL,
      nama_layanan TEXT NOT NULL,
      nama_pengguna_akun TEXT NOT NULL,
      password_terenkripsi TEXT NOT NULL,
      catatan TEXT,
      privat_status INTEGER DEFAULT 1,
      dibuat_pada TEXT DEFAULT (datetime('now')),
      diperbarui_pada TEXT DEFAULT (datetime('now'))
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
    const db = await getDatabaseAsync();
    ensureTable(db);

    const existing = db
      .prepare(
        `SELECT id, pemilik_id, password_terenkripsi, privat_status FROM kredensial WHERE id = ?`
      )
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Get viewer's role
    const viewer = db
      .prepare(`SELECT id, role FROM profil WHERE id = ?`)
      .get(viewerId) as any;

    // Check access permission:
    // - Owner can always view
    // - Admin and Manager can view if not private
    // - Regular users can only view their own
    const isOwner = viewerId === existing.pemilik_id;
    const isAdminOrManager =
      viewer && (viewer.role === "admin" || viewer.role === "manager");
    const isPrivate = existing.privat_status === 1;

    if (!isOwner && (!isAdminOrManager || isPrivate)) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const password = decryptText(existing.password_terenkripsi);
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
    const {
      nama_layanan,
      nama_pengguna_akun,
      password,
      catatan,
      privat_status,
    } = await request.json();

    const db = await getDatabaseAsync();
    ensureTable(db);

    const existing = db
      .prepare(
        `SELECT id, pemilik_id, privat_status FROM kredensial WHERE id = ?`
      )
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Privacy rule: if private and viewer != owner, forbid
    if (existing.privat_status && viewerId !== existing.pemilik_id) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (typeof nama_layanan !== "undefined") {
      fields.push("nama_layanan = ?");
      values.push(nama_layanan);
    }
    if (typeof nama_pengguna_akun !== "undefined") {
      fields.push("nama_pengguna_akun = ?");
      values.push(nama_pengguna_akun);
    }
    if (typeof catatan !== "undefined") {
      fields.push("catatan = ?");
      values.push(catatan || "");
    }
    if (typeof privat_status !== "undefined") {
      fields.push("privat_status = ?");
      values.push(privat_status ? 1 : 0);
    }
    if (typeof password !== "undefined" && password !== "") {
      fields.push("password_terenkripsi = ?");
      values.push(encryptText(password));
    }
    if (fields.length === 0)
      return NextResponse.json(
        { error: "Tidak ada perubahan" },
        { status: 400 }
      );

    const sql = `UPDATE kredensial SET ${fields.join(
      ", "
    )}, diperbarui_pada = datetime('now') WHERE id = ?`;
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
    const db = await getDatabaseAsync();
    ensureTable(db);

    const existing = db
      .prepare(
        `SELECT id, pemilik_id, privat_status FROM kredensial WHERE id = ?`
      )
      .get(id) as any;
    if (!existing)
      return NextResponse.json(
        { error: "Credential tidak ditemukan" },
        { status: 404 }
      );

    // Only owner can delete; if public, allow admin in future (not implemented now)
    if (viewerId !== existing.pemilik_id) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    db.prepare(`DELETE FROM kredensial WHERE id = ?`).run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/passwords/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus kredensial" },
      { status: 500 }
    );
  }
}
