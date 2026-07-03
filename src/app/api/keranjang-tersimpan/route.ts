import { NextRequest, NextResponse } from "next/server";

import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { parkCartInputSchema } from "@/lib/schemas/keranjang-tersimpan";
import {
  listParkedCarts,
  parkCart,
} from "@/lib/services/keranjang-tersimpan-service";

export async function GET() {
  try {
    const keranjang = await listParkedCarts();
    return NextResponse.json({ keranjang_tersimpan: keranjang });
  } catch (error: any) {
    console.error("Error fetching keranjang tersimpan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat keranjang tersimpan" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();

    const parsed = parkCartInputSchema.passthrough().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data keranjang tersimpan tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const created = await parkCart(parsed.data, session.uid);

    return NextResponse.json(
      {
        message: "Keranjang berhasil diparkir",
        keranjang_tersimpan: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error parking cart:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memarkir keranjang" },
      { status: 500 }
    );
  }
}
