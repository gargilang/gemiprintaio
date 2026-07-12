import { NextRequest, NextResponse } from "next/server";

import {
  AuthGuardError,
  requireOperationalRole,
} from "@/lib/auth-guard-server";
import {
  reconcilePendingMaklonInputSchema,
  reconcilePendingMaklonItem,
} from "@/lib/services/pending-maklon-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  try {
    const session = await requireOperationalRole();
    const body = await req.json();
    const parsed = reconcilePendingMaklonInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Data reconcile pending maklon tidak valid",
          issues: parsed.error.issues,
        },
        { status: 422 },
      );
    }

    await reconcilePendingMaklonItem(params.id, {
      ...parsed.data,
      dibuat_oleh: session.uid,
    });

    return NextResponse.json({
      message: "Pending maklon berhasil direconcile",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error reconciling pending maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menyimpan reconcile pending maklon" },
      { status: 500 },
    );
  }
}