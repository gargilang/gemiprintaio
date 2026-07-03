import { NextRequest, NextResponse } from "next/server";

import { requireSession, AuthGuardError } from "@/lib/auth-guard-server";
import { jadikanPenawaran } from "@/lib/services/keranjang-tersimpan-service";
import type { QuotationItemInput } from "@/lib/services/quotation-service";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const session = await requireSession();
    const body = await req.json();
    const { items, meta } = body as {
      items: QuotationItemInput[];
      meta?: {
        pelanggan_id?: string | null;
        pelanggan_nama_snapshot?: string | null;
        pelanggan_kota?: string | null;
        kena_ppn?: boolean;
        ppn_persen?: number;
        ppn_metode?: "EKSKLUSIF" | "INKLUSIF";
        catatan?: string | null;
      };
    };

    const result = await jadikanPenawaran(params.id, items, {
      ...(meta || {}),
      dibuatOleh: session.uid,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error jadikan penawaran dari keranjang tersimpan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menjadikan penawaran" },
      { status: 500 }
    );
  }
}
