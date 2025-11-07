import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { initializeDatabase } from "@/lib/sqlite-db";
import { v4 as uuidv4 } from "uuid";
import { encryptText, decryptText } from "@/lib/crypto";

function ensureTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kredensial (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      account_username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      notes TEXT,
      is_private INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_owner ON kredensial(owner_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_service ON kredensial(service_name);
  `);
}

// GET kredensial: requires viewer id (header x-user-id) to filter privacy
export async function GET(request: NextRequest) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const db = await initializeDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    ensureTable(db);

    // Get viewer's role
    let viewerRole = "user";
    if (viewerId) {
      const viewer = db
        .prepare(`SELECT id, role FROM profil WHERE id = ?`)
        .get(viewerId) as any;
      if (viewer) {
        viewerRole = viewer.role;
      }
    }

    let rows: any[];
    if (viewerId) {
      rows = db
        .prepare(
          `SELECT id, owner_id, service_name, account_username, password_encrypted, notes, is_private, created_at, updated_at
           FROM kredensial
           WHERE is_private = 0 OR owner_id = ?
           ORDER BY updated_at DESC`
        )
        .all(viewerId);
    } else {
      // Without viewer context, only public entries
      rows = db
        .prepare(
          `SELECT id, owner_id, service_name, account_username, password_encrypted, notes, is_private, created_at, updated_at
           FROM kredensial
           WHERE is_private = 0
           ORDER BY updated_at DESC`
        )
        .all();
    }

    // Never return raw passwords. Return masked preview and a flag indicating ownership.
    const data = rows.map((r) => {
      const isOwner = viewerId === r.owner_id;
      const isPrivate = !!r.is_private;
      const isAdminOrManager =
        viewerRole === "admin" || viewerRole === "manager";

      // Can view password if:
      // - User is the owner, OR
      // - User is admin/manager AND credential is not private
      const canView = isOwner || (isAdminOrManager && !isPrivate);

      return {
        id: r.id,
        owner_id: r.owner_id,
        service_name: r.service_name,
        account_username: r.account_username,
        notes: r.notes || "",
        is_private: isPrivate,
        can_view_password: canView && !!r.password_encrypted,
      };
    });

    return NextResponse.json({ kredensial: data });
  } catch (error) {
    console.error("GET /api/passwords error:", error);
    return NextResponse.json(
      { error: "Gagal memuat kredensial" },
      { status: 500 }
    );
  }
}

// POST create credential: owner is the viewer
export async function POST(request: NextRequest) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const {
      service_name,
      account_username,
      password,
      notes = "",
      is_private = 1,
    } = await request.json();

    if (!viewerId)
      return NextResponse.json(
        { error: "Viewer tidak diketahui" },
        { status: 400 }
      );
    if (!service_name || !account_username || !password) {
      return NextResponse.json(
        { error: "service_name, account_username, password wajib diisi" },
        { status: 400 }
      );
    }

    const db = await initializeDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database tidak tersedia" },
        { status: 500 }
      );
    ensureTable(db);

    const id = uuidv4();
    const password_encrypted = encryptText(password);
    db.prepare(
      `INSERT INTO kredensial (id, owner_id, service_name, account_username, password_encrypted, notes, is_private)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      viewerId,
      service_name,
      account_username,
      password_encrypted,
      notes,
      is_private ? 1 : 0
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    console.error("POST /api/passwords error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan kredensial" },
      { status: 500 }
    );
  }
}
