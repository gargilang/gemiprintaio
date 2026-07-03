import { NextRequest, NextResponse } from "next/server";

import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { jadikanPenawaran } from "@/lib/services/keranjang-tersimpan-service";
import { jadikanPenawaranInputSchema } from "@/lib/schemas/keranjang-tersimpan";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = jadikanPenawaranInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 422 },
      );
    }
    const { items, meta } = parsed.data;

    const result = await jadikanPenawaran(params.id, items as any, {
      ...(meta || {}),
      dibuatOleh: session.uid,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error jadikan penawaran dari keranjang tersimpan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menjadikan penawaran" },
      { status: 500 },
    );
  }
}
