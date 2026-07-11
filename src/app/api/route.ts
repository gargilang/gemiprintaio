import { type NextRequest, NextResponse } from "next/server";
import { db, generateId, getCurrentTimestamp } from "@/lib/db-unified";
import { requireAdminOrManager, requireSession } from "@/lib/auth-guard-server";
import { AuthGuardError } from "@/lib/auth-guard-error";
import { friendlyPgError } from "@/lib/pg-error";
import {
  hitungQtyKomponenDimensiM2,
  isBarangBerdimensi,
} from "@/lib/bom-utils";
import { z } from "zod";

const KomponenSchema = z
  .object({
    parent_barang_id: z.string().min(1),
    komponen_id: z.string().min(1),
    qty: z.coerce.number().finite().positive(),
    jumlah_roll: z.coerce.number().finite().int().min(1).optional().nullable(),
    panjang: z.coerce.number().finite().positive().optional().nullable(),
    lebar: z.coerce.number().finite().positive().optional().nullable(),
    satuan: z.string().optional().nullable(),
    catatan: z.string().optional().nullable(),
    // B2: kaitkan komponen ke produk jual tertentu (harga_barang_satuan).
    unit_price_id: z.string().min(1).optional().nullable(),
  })
  .passthrough();

async function validateStrukturRakitan(
  parentBarangId: string,
  komponenId: string,
  unitPriceId: string | null,
) {
  const res = await db.query<any>("barang_komponen", {
    where: { is_deleted: 0 },
  });
  if (res.error) throw res.error;
  const rows = res.data || [];

  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parent_barang_id || !row.komponen_id) continue;
    const children = childrenByParent.get(row.parent_barang_id) || [];
    children.push(row.komponen_id);
    childrenByParent.set(row.parent_barang_id, children);
  }

  const visited = new Set<string>();
  const stack = [komponenId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentBarangId) {
      return {
        ok: false as const,
        error:
          "Komponen ini tidak bisa ditambahkan karena akan membuat siklus rakitan.",
      };
    }
    if (visited.has(current)) continue;
    visited.add(current);
    for (const child of childrenByParent.get(current) || []) {
      stack.push(child);
    }
  }

  const konflik = rows.find((row: any) => {
    if (row.parent_barang_id !== parentBarangId) return false;
    if (row.komponen_id !== komponenId) return false;
    const existingUnitPriceId = row.unit_price_id || null;
    return (
      existingUnitPriceId === unitPriceId ||
      existingUnitPriceId === null ||
      unitPriceId === null
    );
  });

  if (konflik) {
    const existingUnitPriceId = konflik.unit_price_id || null;
    if (existingUnitPriceId === unitPriceId) {
      return {
        ok: false as const,
        error: "Komponen ini sudah dipakai untuk Produk Jual yang sama.",
      };
    }
    return {
      ok: false as const,
      error:
        "Komponen ini sudah dipakai di scope Semua Produk Jual atau Produk Jual spesifik. Hapus baris lama dulu agar stok tidak terpotong ganda.",
    };
  }

  return { ok: true as const };
}

async function validateKomponenDimensi(data: z.infer<typeof KomponenSchema>) {
  const komponenRes = await db.queryOne<any>("barang", {
    where: { id: data.komponen_id },
  });
  if (komponenRes.error) throw komponenRes.error;
  const komponen = komponenRes.data;
  if (!komponen) {
    return {
      ok: false as const,
      status: 422,
      error: "Barang komponen tidak ditemukan",
    };
  }

  const berdimensi = isBarangBerdimensi(komponen.butuh_dimensi_status);
  if (berdimensi) {
    const panjang = data.panjang != null ? Number(data.panjang) : null;
    const lebar = data.lebar != null ? Number(data.lebar) : null;
    if (panjang == null || lebar == null || panjang <= 0 || lebar <= 0) {
      return {
        ok: false as const,
        status: 422,
        error: "Komponen berdimensi wajib diisi: lebar (m) dan panjang (m).",
      };
    }
    const qtyM2 = hitungQtyKomponenDimensiM2(1, panjang, lebar);
    if (Math.abs(qtyM2 - Number(data.qty)) > 0.0001) {
      return {
        ok: false as const,
        status: 422,
        error: "Qty m² tidak sesuai dengan lebar × panjang.",
      };
    }
    return { ok: true as const, berdimensi: true, komponen };
  }

  if (data.jumlah_roll != null || data.panjang != null || data.lebar != null) {
    return {
      ok: false as const,
      status: 422,
      error: "Komponen non-dimensi tidak memakai lebar/panjang/roll.",
    };
  }

  return { ok: true as const, berdimensi: false, komponen };
}

/** GET /api/barang-komponen?parent_barang_id=xxx */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const parentId = req.nextUrl.searchParams.get("parent_barang_id");
    if (!parentId) {
      return NextResponse.json(
        { error: "parent_barang_id wajib diisi" },
        { status: 400 },
      );
    }
    const unitPriceId = req.nextUrl.searchParams.get("unit_price_id");
    const where: Record<string, unknown> = {
      parent_barang_id: parentId,
      is_deleted: 0,
    };
    // B2: filter opsional per produk jual. null string ("") → scope barang-level.
    if (unitPriceId !== null) {
      where.unit_price_id = unitPriceId === "" ? null : unitPriceId;
    }
    const res = await db.query<any>("barang_komponen", { where });
    if (res.error) throw res.error;

    const komponents = res.data || [];
    const komponentIds = komponents.map((k: any) => k.komponen_id);
    const barangMap = new Map<string, any>();
    if (komponentIds.length > 0) {
      const barangRes = await db.query<any>("barang", {});
      for (const b of barangRes.data || []) {
        barangMap.set(b.id, b);
      }
    }

    return NextResponse.json({
      komponen: komponents.map((k: any) => {
        const barang = barangMap.get(k.komponen_id);
        return {
          ...k,
          komponen_nama: barang?.nama || k.komponen_id,
          komponen_satuan: barang?.satuan_dasar || k.satuan,
          komponen_butuh_dimensi: barang?.butuh_dimensi_status ?? 0,
        };
      }),
    });
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/barang-komponen:", e);
    return NextResponse.json(
      { error: friendlyPgError(e, "barang_komponen") },
      { status: 500 },
    );
  }
}

/** POST /api/barang-komponen — buat komponen baru */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminOrManager();
    const body = await req.json();
    const parsed = KomponenSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Input tidak valid", details: parsed.error.issues },
        { status: 422 },
      );
    }
    const data = parsed.data;
    if (data.parent_barang_id === data.komponen_id) {
      return NextResponse.json(
        { error: "Barang tidak bisa menjadi komponen dirinya sendiri" },
        { status: 422 },
      );
    }

    const dimCheck = await validateKomponenDimensi(data);
    if (!dimCheck.ok) {
      return NextResponse.json(
        { error: dimCheck.error },
        { status: dimCheck.status },
      );
    }

    // B2: validasi unit_price_id milik parent_barang_id.
    let unitPriceId: string | null = null;
    if (data.unit_price_id) {
      const upRes = await db.queryOne<any>("harga_barang_satuan", {
        where: { id: data.unit_price_id },
      });
      if (upRes.error) throw upRes.error;
      if (!upRes.data || upRes.data.barang_id !== data.parent_barang_id) {
        return NextResponse.json(
          { error: "Produk jual tidak milik barang ini" },
          { status: 422 },
        );
      }
      unitPriceId = data.unit_price_id;
    }

    const strukturCheck = await validateStrukturRakitan(
      data.parent_barang_id,
      data.komponen_id,
      unitPriceId,
    );
    if (!strukturCheck.ok) {
      return NextResponse.json({ error: strukturCheck.error }, { status: 422 });
    }

    const now = getCurrentTimestamp();
    const res = await db.insert("barang_komponen", {
      id: generateId(),
      parent_barang_id: data.parent_barang_id,
      komponen_id: data.komponen_id,
      qty: data.qty,
      // Kolom legacy masih NOT NULL DEFAULT 1 di DB. UI tidak memakai jumlah
      // roll untuk komponen rakitan; simpan 1 agar constraint lama tetap valid
      // dan maknanya netral.
      jumlah_roll: dimCheck.berdimensi
        ? data.jumlah_roll != null
          ? Number(data.jumlah_roll)
          : 1
        : 1,
      panjang: dimCheck.berdimensi ? data.panjang : null,
      lebar: dimCheck.berdimensi ? data.lebar : null,
      satuan: data.satuan ?? dimCheck.komponen?.satuan_dasar ?? null,
      catatan: data.catatan ?? null,
      unit_price_id: unitPriceId,
      dibuat_oleh: session.uid,
      dibuat_pada: now,
      diperbarui_pada: now,
      is_deleted: 0,
      sync_status: "pending",
    });
    if (res.error) throw res.error;
    return NextResponse.json({ id: (res.data as any)?.id }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthGuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/barang-komponen:", e);
    return NextResponse.json(
      { error: friendlyPgError(e, "barang_komponen") },
      { status: 500 },
    );
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
    if (e instanceof AuthGuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/barang-komponen:", e);
    return NextResponse.json(
      { error: friendlyPgError(e, "barang_komponen") },
      { status: 500 },
    );
  }
}
