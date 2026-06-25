import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  listPinjaman,
  catatTarikPinjaman,
  bayarPinjamanTunai,
  revertPinjaman,
} from "@/lib/services/pinjaman-karyawan-service";
import { pinjamanActionSchema } from "@/lib/schemas/penggajian";

const RIWAYAT_LIMIT = 30;

/**
 * GET /api/penggajian/pinjaman?actor_id=... — daftar pinjaman + saldo (ungated).
 * Ambil semua sekali, hitung saldo di memori, kembalikan maksimal 30 terbaru +
 * total keseluruhan sehingga klien bisa menampilkan "X dari Y transaksi".
 * Tanpa actor_id: kembalikan seluruh ledger tanpa limit (untuk keperluan internal).
 */
export async function GET(req: NextRequest) {
  try {
    const actorId = req.nextUrl.searchParams.get("actor_id") || undefined;
    const semua = await listPinjaman(actorId);

    let saldo: number | null = null;
    if (actorId) {
      saldo = 0;
      for (const r of semua) {
        const jumlah = Number(r.jumlah) || 0;
        if (r.jenis === "TARIK") saldo += jumlah;
        else saldo -= jumlah;
      }
    }

    return NextResponse.json({
      pinjaman: actorId ? semua.slice(0, RIWAYAT_LIMIT) : semua,
      totalRiwayat: semua.length,
      saldo,
    });
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
