import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import {
  AuthGuardError,
  requireNotDemo,
  requireSession,
} from "@/lib/auth-guard-server";
import {
  createNotification,
  getNotifications,
} from "@/lib/services/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notificationSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  tipe: z.enum(["success", "error", "info", "warning"]),
  kategori: z.enum(["toast", "bank", "sistem"]).optional().default("toast"),
  judul: z.string().max(200).optional().nullable(),
  pesan: z.string().min(1).max(2000),
  sumber_path: z.string().max(300).optional().nullable(),
  sumber_judul: z.string().max(200).optional().nullable(),
  ref_tipe: z.string().max(80).optional().nullable(),
  ref_id: z.string().max(120).optional().nullable(),
  metadata_json: z.record(z.unknown()).optional().nullable(),
  dibuat_pada: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSession();

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const data = await getNotifications({ limit });

    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status, error);
    }
    return apiError("Gagal memuat notifikasi", 500, error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await requireNotDemo(session);

    const body = await request.json();
    const parsed = notificationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data notifikasi tidak valid", details: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const result = await createNotification({
      ...parsed.data,
      dibuat_oleh: session.uid,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthGuardError) {
      return apiError(error.message, error.status, error);
    }
    return apiError("Gagal menyimpan notifikasi", 500, error);
  }
}
