import { type NextRequest, NextResponse } from "next/server";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { requireAdminOrManager, requireSession } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { z } from "zod";

const KomponenSchema = z.object({
  parent_barang_id: z.string().min(1),
  komponen_id: z.string().min(1),
  qty: z.coerce.number().finite().positive(),
  satuan: z.string().optional().nullable(),
  catatan: z.string().optional().nullable(),
});

/** GET /api/barang-komponen?parent_barang_id=xxx */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const parentId = req.nextUrl.searchParams.get("parent_barang_id");
    if (!parentId) {
      return NextResponse.json({ error: "parent_barang_id wajib diisi" }, { status: 400 });
    }
    const res = await db.query<any>("barang_komponen", {
      where: { parent_barang_id: parentId, is_deleted: 0 },
    });
    if (res.error) throw res.error;

    // Enrich dengan nama barang komponen
    const komponents = res.data || [];
    const komponentIds = komponents.map((k: any) => k.komponen_id);
    let barangMap = new Map<string, any>();
    if (komponentIds.length > 0) {
      const barangRes = await db.query<any>("barang", {});
      for (const b of barangRes.data || []) {
        barangMap.set(b.id, b);
      }
    }

    return NextResponse.json({
      komponen: komponents.map((k: any) => ({
        ...k,
        komponen_nama: barangMap.get(k.komponen_id)?.nama || k.komponen_id,
        komponen_satuan: barangMap.get(k.komponen_id)?.satuan_dasar || k.satuan,
      })),
    });
  } catch (e) {
    if (e instanceof AuthGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** POST /api/barang-komponen — buat komponen baru */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminOrManager();
    const body = await req.json();
    const parsed = KomponenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Input tidak valid", details: parsed.error.issues }, { status: 422 });
    }
    const data = parsed.data;
    if (data.parent_barang_id === data.komponen_id) {
      return NextResponse.json({ error: "Barang tidak bisa menjadi komponen dirinya sendiri" }, { status: 422 });
    }
    const now = getCurrentTimestamp();
    const res = await db.insert("barang_komponen", {
      id: generateId(),
      parent_barang_id: data.parent_barang_id,
      komponen_id: data.komponen_id,
      qty: data.qty,
      satuan: data.satuan ?? null,
      catatan: data.catatan ?? null,
      dibuat_oleh: session.uid,
      dibuat_pada: now,
      diperbarui_pada: now,
      is_deleted: 0,
      sync_status: "pending",
    });
    if (res.error) throw res.error;
    return NextResponse.json({ id: (res.data as any)?.id }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** DELETE /api/barang-komponen?id=xxx */
export async function DELETE(req: NextRequest) {
  try {
    await requireAdminOrManager();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
    }
    const res = await db.update("barang_komponen", id, {
      is_deleted: 1,
      deleted_at: getCurrentTimestamp(),
    });
    if (res.error) throw res.error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthGuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
