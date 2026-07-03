import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";
import { katalogMaklonInputSchema } from "@/lib/schemas/katalog-maklon";
import {
  deleteKatalogMaklon,
  updateKatalogMaklon,
} from "@/lib/services/katalog-maklon-service";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    const body = await req.json();

    const parsed = katalogMaklonInputSchema.passthrough().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data katalog maklon tidak valid", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    await updateKatalogMaklon(params.id, parsed.data);

    return NextResponse.json({
      message: "Katalog maklon berhasil diperbarui",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating katalog maklon:", error);
    const msg = error.message || "Gagal memperbarui katalog maklon";
    const clientError = msg.includes("sudah ada");
    return NextResponse.json(
      { error: msg },
      { status: clientError ? 400 : 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    await deleteKatalogMaklon(params.id);

    return NextResponse.json({
      message: "Katalog maklon berhasil dihapus",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting katalog maklon:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menghapus katalog maklon" },
      { status: 500 }
    );
  }
}
