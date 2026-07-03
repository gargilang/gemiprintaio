import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { katalogMaklonInputSchema } from "@/lib/schemas/katalog-maklon";
import {
  createKatalogMaklon,
  listKatalogMaklon,
} from "@/lib/services/katalog-maklon-service";

export async function GET(req: NextRequest) {
  try {
    const onlyAktif =
      req.nextUrl.searchParams.get("include_inactive") !== "1";
    const katalog = await listKatalogMaklon(onlyAktif);
    return NextResponse.json({ katalog });
  } catch (error: any) {
    console.error("Error fetching katalog maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat katalog maklon" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminOrManager();
    const body = await req.json();

    const parsed = katalogMaklonInputSchema.passthrough().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data katalog maklon tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const created = await createKatalogMaklon(parsed.data, session.uid);

    return NextResponse.json(
      {
        message: "Katalog maklon berhasil ditambahkan",
        katalog: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creating katalog maklon:", error);
    const msg = error.message || "Gagal menambahkan katalog maklon";
    const clientError = msg.includes("sudah ada");
    return NextResponse.json(
      { error: msg },
      { status: clientError ? 400 : 500 }
    );
  }
}
