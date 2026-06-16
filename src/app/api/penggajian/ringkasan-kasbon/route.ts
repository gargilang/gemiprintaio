import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  listBusinessActors,
  listActorRoles,
} from "@/lib/services/business-actor-service";
import { hitungSaldoPinjamanBatch } from "@/lib/services/pinjaman-karyawan-service";

export async function GET() {
  try {
    // Ambil semua pegawai aktif dan daftar peran
    const [actors, roles] = await Promise.all([
      listBusinessActors({ includeInactive: false }),
      listActorRoles(),
    ]);
    const labelByCode = new Map(roles.map((r) => [r.role_code, r.role_label]));

    if (actors.length === 0) {
      return NextResponse.json({
        karyawan: [],
        total_kasbon: 0,
        jumlah_karyawan: 0,
      });
    }

    const actorIds = actors.map((a) => a.id);

    // Hitung saldo kasbon batch (hindari N+1)
    const saldoMap = await hitungSaldoPinjamanBatch(actorIds);

    const karyawan = actors.map((a) => ({
      actor_id: a.id,
      nama: a.display_name,
      role: a.role_code,
      role_label: labelByCode.get(a.role_code) ?? a.role_code,
      saldo_pinjaman: saldoMap.get(a.id) ?? 0,
    }));

    const total_kasbon = karyawan.reduce((sum, k) => sum + k.saldo_pinjaman, 0);
    const jumlah_karyawan = actors.length;

    return NextResponse.json({ karyawan, total_kasbon, jumlah_karyawan });
  } catch (error) {
    console.error("GET /api/penggajian/ringkasan-kasbon error:", error);
    return NextResponse.json(
      { error: "Gagal memuat ringkasan kasbon" },
      { status: 500 },
    );
  }
}
