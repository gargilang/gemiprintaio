import { NextRequest, NextResponse } from "next/server";

import {
  requireSession,
  requireNotDemo,
  AuthGuardError,
} from "@/lib/auth-guard-server";
import {
  deleteParkedCart,
  loadParkedCart,
} from "@/lib/services/keranjang-tersimpan-service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  try {
    const keranjang = await loadParkedCart(params.id);

    if (!keranjang) {
      return NextResponse.json(
        { error: "Keranjang tersimpan tidak ditemukan" },
        { status: 404 },
      );
    }

    return NextResponse.json({ keranjang_tersimpan: keranjang });
  } catch (error: any) {
    console.error("Error loading keranjang tersimpan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal memuat keranjang tersimpan" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  try {
    await requireNotDemo(await requireSession());
    await deleteParkedCart(params.id);

    return NextResponse.json({
      message: "Keranjang tersimpan berhasil dihapus",
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("Error deleting keranjang tersimpan:", error);
    return NextResponse.json(
      { error: error.message || "Gagal menghapus keranjang tersimpan" },
      { status: 500 },
    );
  }
}
