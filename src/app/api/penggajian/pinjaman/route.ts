import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  listPinjaman,
  hitungSaldoPinjaman,
  catatTarikPinjaman,
  bayarPinjamanTunai,
  revertPinjaman,
} from "@/lib/services/pinjaman-karyawan-service";
import { pinjamanActionSchema } from "@/lib/schemas/penggajian";

/**
 * GET /api/penggajian/pinjaman?actor_id=... — daftar pinjaman + saldo (ungated).
 * Tanpa actor_id: kembalikan seluruh ledger (tanpa saldo).
 */
export async function GET(req: NextRequest) {
  try {
    const actorId = req.nextUrl.searchParams.get("actor_id") || undefined;
    const pinjaman = await listPinjaman(actorId);
    const saldo = actorId ? await hitungSaldoPinjaman(actorId) : null;
    return NextResponse.json({ pinjaman, saldo });
  } catch (error: any) {
    console.error("Error fetching pinjaman karyawan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat data pinjaman" },
      { status: 500 }
    );
  }
}

/** POST /api/penggajian/pinjaman — tarik | bayar | revert (guarded). */
export async function POST(req: NextRequest) {
  try {
    // dibuat_oleh diturunkan dari sesi terverifikasi, bukan dari klien.
    const session = await requireAdminOrManager();
    const body = await req.json();
    const parsed = pinjamanActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data pinjaman tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    if (data.action === "tarik") {
      const pinjaman = await catatTarikPinjaman({
        actorId: data.actor_id,
        jumlah: data.jumlah,
        tanggal: data.tanggal,
        keterangan: data.keterangan ?? undefined,
        dibuatOleh: session.uid,
      });
      return NextResponse.json({ pinjaman }, { status: 201 });
    }
    if (data.action === "bayar") {
      const pinjaman = await bayarPinjamanTunai({
        actorId: data.actor_id,
        jumlah: data.jumlah,
        tanggal: data.tanggal,
        keterangan: data.keterangan ?? undefined,
        dibuatOleh: session.uid,
      });
      return NextResponse.json({ pinjaman }, { status: 201 });
    }
    // revert
    await revertPinjaman(data.id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error mutating pinjaman karyawan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menyimpan data pinjaman" },
      { status: 500 }
    );
  }
}
