import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import {
  listPayrollRun,
  hitungDraftPayroll,
  simpanDraftPayroll,
  bayarPayrollRun,
  voidPayrollRun,
} from "@/lib/services/payroll-service";
import { payrollRunActionSchema } from "@/lib/schemas/payroll";

/** GET /api/penggajian/run — daftar payroll run + slip (ungated read). */
export async function GET() {
  try {
    const runs = await listPayrollRun();
    return NextResponse.json({ runs });
  } catch (error: any) {
    console.error("Error fetching payroll runs:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat data payroll" },
      { status: 500 }
    );
  }
}

/** POST /api/penggajian/run — hitung | simpan | bayar | void (guarded). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminOrManager();
    const body = await req.json();
    const parsed = payrollRunActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data payroll tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }
    const data = parsed.data;

    if (data.action === "hitung") {
      const draft = await hitungDraftPayroll(data.periode, {
        sumberNilai: data.sumber_nilai,
        potonganPerActor: data.potongan_per_actor,
      });
      return NextResponse.json({ draft });
    }
    if (data.action === "simpan") {
      const runId = await simpanDraftPayroll(
        {
          periode: data.periode,
          slips: data.slips as any,
          total_bruto: data.total_bruto,
          total_potongan_kasbon: data.total_potongan_kasbon,
          total_neto: data.total_neto,
        },
        session.uid
      );
      return NextResponse.json({ run_id: runId }, { status: 201 });
    }
    if (data.action === "bayar") {
      await bayarPayrollRun(
        data.run_id,
        data.tanggal_bayar,
        data.metode_bayar,
        session.uid
      );
      return NextResponse.json({ ok: true });
    }
    // void
    await voidPayrollRun(data.run_id, session.uid);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error mutating payroll run:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memproses payroll" },
      { status: 500 }
    );
  }
}
