import { NextRequest, NextResponse } from "next/server";

import { rowExistsCompositeEq } from "@/lib/duplicate-check";
import {
  deleteQuickSpec,
  getQuickSpecById,
  getQuickSpecRowById,
  updateQuickSpec,
} from "@/lib/services/master-service";
import { requireAdminOrManager, AuthGuardError } from "@/lib/auth-guard-server";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await requireAdminOrManager();
    const body = await req.json();
    const { tipe_spesifikasi, nilai_spesifikasi, urutan_tampilan } = body;

    if (!tipe_spesifikasi || !tipe_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Tipe spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    if (!nilai_spesifikasi || !nilai_spesifikasi.trim()) {
      return NextResponse.json(
        { error: "Nilai spesifikasi harus diisi" },
        { status: 400 }
      );
    }

    const existing = await getQuickSpecById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Spesifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    const dup = await rowExistsCompositeEq(
      "spesifikasi_cepat_barang",
      [
        ["kategori_id", existing.kategori_id],
        ["tipe_spesifikasi", tipe_spesifikasi.trim()],
        ["nilai_spesifikasi", nilai_spesifikasi.trim()],
      ],
      params.id
    );
    if (dup) {
      return NextResponse.json(
        { error: "Spesifikasi ini sudah ada" },
        { status: 400 }
      );
    }

    await updateQuickSpec(params.id, {
      tipe_spesifikasi: tipe_spesifikasi.trim(),
      nilai_spesifikasi: nilai_spesifikasi.trim(),
      urutan_tampilan: urutan_tampilan || 0,
    });

    const updatedQuickSpec = await getQuickSpecRowById(params.id);

    return NextResponse.json({
      message: "Spesifikasi cepat berhasil diupdate",
      quickSpec: updatedQuickSpec,
    });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error updating quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update quick spec" },
      { status: 500 }
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
    const existing = await getQuickSpecById(params.id);

    if (!existing) {
      return NextResponse.json(
        { error: "Spesifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    await deleteQuickSpec(params.id);

    return NextResponse.json({ message: "Spesifikasi cepat berhasil dihapus" });
  } catch (error: any) {
    if (error instanceof AuthGuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error deleting quick spec:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete quick spec" },
      { status: 500 }
    );
  }
}
