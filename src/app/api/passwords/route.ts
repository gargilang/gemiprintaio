import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDatabaseAsync } from "@/lib/sqlite-db";
import { v4 as uuidv4 } from "uuid";
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
      diperbarui_pada TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (pemilik_id) REFERENCES profil(id)
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_owner ON kredensial(pemilik_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_service ON kredensial(nama_layanan);
  `);
}

// GET kredensial: requires viewer id (header x-user-id) to filter privacy
export async function GET(request: NextRequest) {
  try {
    const viewerId = request.headers.get("x-user-id") || undefined;
    const db = await getDatabaseAsync();
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
          `SELECT id, pemilik_id, nama_layanan, nama_pengguna_akun, password_terenkripsi, catatan, privat_status, dibuat_pada, diperbarui_pada
           FROM kredensial
           WHERE privat_status = 0 OR pemilik_id = ?
           ORDER BY diperbarui_pada DESC`
        )
        .all(viewerId);
    } else {
      // Without viewer context, only public entries
      rows = db
        .prepare(
          `SELECT id, pemilik_id, nama_layanan, nama_pengguna_akun, password_terenkripsi, catatan, privat_status, dibuat_pada, diperbarui_pada
           FROM kredensial
           WHERE privat_status = 0
           ORDER BY diperbarui_pada DESC`
        )
        .all();
    }

    // Never return raw passwords. Return masked preview and a flag indicating ownership.
    const data = rows.map((r) => {
      const isOwner = viewerId === r.pemilik_id;
      const isPrivate = !!r.privat_status;
      const isAdminOrManager =
        viewerRole === "admin" || viewerRole === "manager";

      // Can view password if:
      // - User is the owner, OR
      // - User is admin/manager AND credential is not private
      const canView = isOwner || (isAdminOrManager && !isPrivate);

      return {
        id: r.id,
        pemilik_id: r.pemilik_id,
        nama_layanan: r.nama_layanan,
        nama_pengguna_akun: r.nama_pengguna_akun,
        catatan: r.catatan || "",
        privat_status: isPrivate,
        dapat_melihat_password: canView && !!r.password_terenkripsi,
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
      nama_layanan,
      nama_pengguna_akun,
      password,
      catatan = "",
      privat_status = 1,
    } = await request.json();

    if (!viewerId)
      return NextResponse.json(
        { error: "Viewer tidak diketahui" },
        { status: 400 }
      );
    if (!nama_layanan || !nama_pengguna_akun || !password) {
      return NextResponse.json(
        { error: "nama_layanan, nama_pengguna_akun, password wajib diisi" },
        { status: 400 }
      );
    }

    const db = await getDatabaseAsync();
    ensureTable(db);

    const id = uuidv4();
    const password_terenkripsi = encryptText(password);
    db.prepare(
      `INSERT INTO kredensial (id, pemilik_id, nama_layanan, nama_pengguna_akun, password_terenkripsi, catatan, privat_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      viewerId,
      nama_layanan,
      nama_pengguna_akun,
      password_terenkripsi,
      catatan,
      privat_status ? 1 : 0
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
